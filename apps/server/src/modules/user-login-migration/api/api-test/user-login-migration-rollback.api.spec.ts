import { EntityManager, ObjectId } from '@mikro-orm/mongodb';
import { AccountEntity } from '@modules/account/repo';
import { schoolEntityFactory } from '@modules/school/testing';
import { ServerTestModule } from '@modules/server';
import { systemEntityFactory } from '@modules/system/testing';
import { User } from '@modules/user/repo';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { cleanupCollections } from '@testing/cleanup-collections';
import { UserAndAccountTestFactory } from '@testing/factory/user-and-account.test.factory';
import { TestApiClient } from '@testing/test-api-client';
import { Response } from 'supertest';
import { UserLoginMigrationEntity } from '../../repo';
import { userLoginMigrationFactory } from '../../testing';

describe('UserLoginMigrationRollbackController (API)', () => {
	let app: INestApplication;
	let em: EntityManager;
	let testApiClient: TestApiClient;

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			imports: [ServerTestModule],
		}).compile();

		app = moduleRef.createNestApplication();
		await app.init();
		em = app.get(EntityManager);
		testApiClient = new TestApiClient(app, '/user-login-migrations');
	});

	afterAll(async () => {
		await app.close();
	});

	afterEach(async () => {
		await cleanupCollections(em);
	});

	describe('[GET] /user-login-migrations', () => {
		describe('when a user is rolled back', () => {
			const setup = async () => {
				const date: Date = new Date(2023, 5, 4);
				const sourceSystem = systemEntityFactory.withLdapConfig().buildWithId({ alias: 'SourceSystem' });
				const targetSystem = systemEntityFactory.withOauthConfig().buildWithId({ alias: 'SANIS' });
				const school = schoolEntityFactory.buildWithId({
					systems: [sourceSystem],
				});
				const userLoginMigration: UserLoginMigrationEntity = userLoginMigrationFactory.buildWithId({
					school,
					targetSystem,
					sourceSystem,
					startedAt: date,
					mandatorySince: date,
					closedAt: date,
					finishedAt: date,
				});
				const { superheroAccount, superheroUser } = UserAndAccountTestFactory.buildSuperhero();
				const { adminAccount, adminUser } = UserAndAccountTestFactory.buildAdmin({ school, externalId: 'externalId' });
				adminUser.previousExternalId = 'previousExternalId';
				adminUser.lastLoginSystemChange = date;

				await em.persistAndFlush([
					sourceSystem,
					targetSystem,
					school,
					userLoginMigration,
					adminAccount,
					adminUser,
					superheroAccount,
					superheroUser,
				]);
				em.clear();

				const loggedInClient = await testApiClient.login(superheroAccount);

				return {
					loggedInClient,
					userLoginMigration,
					migratedUser: adminUser,
					migratedAccount: adminAccount,
				};
			};

			it('should return the users migration', async () => {
				const { loggedInClient, migratedUser, migratedAccount, userLoginMigration } = await setup();

				const response: Response = await loggedInClient.post(`/users/${migratedUser.id}/rollback-migration`);

				const revertedUser = await em.findOneOrFail(User, migratedUser.id);
				const revertedAccount = await em.findOneOrFail(AccountEntity, migratedAccount.id);

				expect(response.status).toEqual(HttpStatus.NO_CONTENT);
				expect(revertedUser.externalId).toEqual(migratedUser.previousExternalId);
				expect(revertedUser.previousExternalId).toBeUndefined();
				expect(revertedUser.lastLoginSystemChange).toBeUndefined();
				expect(revertedUser.outdatedSince).toEqual(userLoginMigration.closedAt);
				expect(revertedAccount.systemId?.toHexString()).toEqual(userLoginMigration.sourceSystem?.id);
			});
		});

		describe('when unauthorized', () => {
			it('should return Unauthorized', async () => {
				const response: Response = await testApiClient.post(
					`/users/${new ObjectId().toHexString()}/rollback-migration`
				);

				expect(response.status).toEqual(HttpStatus.UNAUTHORIZED);
			});
		});
	});
});
