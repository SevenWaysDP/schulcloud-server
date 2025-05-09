import { EntityManager, ObjectId } from '@mikro-orm/mongodb';
import { BoardExternalReferenceType } from '@modules/board/domain/types';
import { BoardNodeEntity } from '@modules/board/repo';
import { columnBoardEntityFactory } from '@modules/board/testing';
import { GroupEntityTypes } from '@modules/group/entity/group.entity';
import { groupEntityFactory } from '@modules/group/testing';
import { RoomMembershipEntity } from '@modules/room-membership';
import { roomMembershipEntityFactory } from '@modules/room-membership/testing';
import { RoomRolesTestFactory } from '@modules/room/testing/room-roles.test.factory';
import { schoolEntityFactory } from '@modules/school/testing';
import { ServerTestModule, serverConfig, type ServerConfig } from '@modules/server';
import { HttpStatus, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { cleanupCollections } from '@testing/cleanup-collections';
import { UserAndAccountTestFactory } from '@testing/factory/user-and-account.test.factory';
import { TestApiClient } from '@testing/test-api-client';
import { RoomEntity } from '../../repo';
import { roomEntityFactory } from '../../testing/room-entity.factory';

describe('Room Controller (API)', () => {
	let app: INestApplication;
	let em: EntityManager;
	let testApiClient: TestApiClient;
	let config: ServerConfig;

	beforeAll(async () => {
		const moduleFixture = await Test.createTestingModule({
			imports: [ServerTestModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		await app.init();
		em = app.get(EntityManager);
		testApiClient = new TestApiClient(app, 'rooms');

		config = serverConfig();
	});

	beforeEach(async () => {
		await cleanupCollections(em);
		config.FEATURE_ROOMS_ENABLED = true;
	});

	afterAll(async () => {
		await app.close();
	});

	describe('DELETE /rooms/:id', () => {
		describe('when the user is not authenticated', () => {
			it('should return a 401 error', async () => {
				const someId = new ObjectId().toHexString();
				const response = await testApiClient.delete(someId);
				expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
			});
		});

		describe('when the feature is disabled', () => {
			const setup = async () => {
				config.FEATURE_ROOMS_ENABLED = false;

				const { studentAccount, studentUser } = UserAndAccountTestFactory.buildStudent();
				await em.persistAndFlush([studentAccount, studentUser]);
				em.clear();

				const loggedInClient = await testApiClient.login(studentAccount);

				return { loggedInClient };
			};

			it('should return a 403 error', async () => {
				const { loggedInClient } = await setup();
				const someId = new ObjectId().toHexString();
				const response = await loggedInClient.delete(someId);
				expect(response.status).toBe(HttpStatus.FORBIDDEN);
			});
		});

		describe('when id is not a valid mongo id', () => {
			const setup = async () => {
				const { studentAccount, studentUser } = UserAndAccountTestFactory.buildStudent();
				await em.persistAndFlush([studentAccount, studentUser]);
				em.clear();

				const loggedInClient = await testApiClient.login(studentAccount);

				return { loggedInClient };
			};

			it('should return a 400 error', async () => {
				const { loggedInClient } = await setup();
				const response = await loggedInClient.delete('42');
				expect(response.status).toBe(HttpStatus.BAD_REQUEST);
			});
		});

		describe('when the user has the required permissions', () => {
			const setup = async () => {
				const room = roomEntityFactory.build();
				const { roomEditorRole, roomOwnerRole } = RoomRolesTestFactory.createRoomRoles();
				const school = schoolEntityFactory.buildWithId();
				const { teacherAccount: teacherOwnerAccount, teacherUser: teacherOwnerUser } =
					UserAndAccountTestFactory.buildTeacher({ school });
				const { teacherAccount: teacherEditorAccount, teacherUser: teacherEditorUser } =
					UserAndAccountTestFactory.buildTeacher({ school });
				const userGroup = groupEntityFactory.buildWithId({
					type: GroupEntityTypes.ROOM,
					users: [
						{ role: roomOwnerRole, user: teacherOwnerUser },
						{ role: roomEditorRole, user: teacherEditorUser },
					],
				});
				const roomMembership = roomMembershipEntityFactory.build({
					roomId: room.id,
					userGroupId: userGroup.id,
					schoolId: teacherOwnerUser.school.id,
				});
				const columnBoard = columnBoardEntityFactory.buildWithId({
					context: { type: BoardExternalReferenceType.Room, id: room.id },
				});
				await em.persistAndFlush([
					room,
					roomMembership,
					teacherOwnerAccount,
					teacherOwnerUser,
					teacherEditorAccount,
					teacherEditorUser,
					userGroup,
					roomOwnerRole,
					columnBoard,
				]);
				em.clear();

				return { teacherOwnerAccount, teacherEditorAccount, room, columnBoard };
			};

			describe('when the room exists', () => {
				it('should delete the room', async () => {
					const { teacherOwnerAccount, room } = await setup();
					const loggedInClient = await testApiClient.login(teacherOwnerAccount);

					const response = await loggedInClient.delete(room.id);
					expect(response.status).toBe(HttpStatus.NO_CONTENT);
					await expect(em.findOneOrFail(RoomEntity, room.id)).rejects.toThrow(NotFoundException);
				});

				it('should delete the roomMembership', async () => {
					const { teacherOwnerAccount, room } = await setup();
					const loggedInClient = await testApiClient.login(teacherOwnerAccount);

					await expect(em.findOneOrFail(RoomMembershipEntity, { roomId: room.id })).resolves.not.toThrow();

					const response = await loggedInClient.delete(room.id);
					expect(response.status).toBe(HttpStatus.NO_CONTENT);
					await expect(em.findOneOrFail(RoomMembershipEntity, { roomId: room.id })).rejects.toThrow(NotFoundException);
				});

				it('should delete the associated boards', async () => {
					const { teacherOwnerAccount, room, columnBoard } = await setup();
					const loggedInClient = await testApiClient.login(teacherOwnerAccount);

					await expect(em.findOneOrFail(BoardNodeEntity, { id: columnBoard.id })).resolves.not.toThrow();

					const response = await loggedInClient.delete(room.id);
					expect(response.status).toBe(HttpStatus.NO_CONTENT);
					await expect(em.findOneOrFail(BoardNodeEntity, { id: columnBoard.id })).rejects.toThrow(NotFoundException);
				});

				describe('when user is not the roomowner', () => {
					it('should fail', async () => {
						const { teacherEditorAccount, room } = await setup();
						const loggedInClient = await testApiClient.login(teacherEditorAccount);

						const response = await loggedInClient.delete(room.id);

						expect(response.status).toBe(HttpStatus.FORBIDDEN);
					});
				});
			});

			describe('when the room does not exist', () => {
				it('should return a 404 error', async () => {
					const { teacherOwnerAccount } = await setup();
					const loggedInClient = await testApiClient.login(teacherOwnerAccount);
					const someId = new ObjectId().toHexString();

					const response = await loggedInClient.delete(someId);

					expect(response.status).toBe(HttpStatus.NOT_FOUND);
				});
			});
		});

		describe('when the user has not the required permissions', () => {
			const setup = async () => {
				const room = roomEntityFactory.build();
				const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
				await em.persistAndFlush([room, teacherAccount, teacherUser]);
				em.clear();

				const loggedInClient = await testApiClient.login(teacherAccount);

				return { loggedInClient, room };
			};

			describe('when the room exists', () => {
				it('should return 403', async () => {
					const { loggedInClient, room } = await setup();

					const response = await loggedInClient.delete(room.id);

					expect(response.status).toBe(HttpStatus.FORBIDDEN);
				});
			});

			describe('when the room does not exist', () => {
				it('should return a 404 error', async () => {
					const { loggedInClient } = await setup();
					const someId = new ObjectId().toHexString();

					const response = await loggedInClient.delete(someId);

					expect(response.status).toBe(HttpStatus.NOT_FOUND);
				});
			});
		});
	});
});
