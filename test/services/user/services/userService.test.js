const { expect } = require('chai');
const { Configuration } = require('@hpi-schul-cloud/commons');
const { ObjectId } = require('mongoose').Types;
const appPromise = require('../../../../src/app');
const { setupNestServices, closeNestServices } = require('../../../utils/setup.nest.services');
const testHelper = require('../../helpers/testObjects');
const { equal: equalIds } = require('../../../../src/helper/compare').ObjectId;

const testGenericErrorMessage = 'Der angefragte Nutzer ist unbekannt!';

describe('user service', () => {
	let userService;
	let classesService;
	let coursesService;
	let app;
	let nestServices;
	let server;
	let testObjects;

	before(async () => {
		app = await appPromise();
		testObjects = testHelper(app);
		userService = app.service('users');
		classesService = app.service('classes');
		coursesService = app.service('courses');
		server = await app.listen(0);
		nestServices = await setupNestServices(app);
	});

	after(async () => {
		await testObjects.cleanup();
		await server.close();
		await closeNestServices(nestServices);
	});

	it('resolves permissions and attributes correctly', async () => {
		const testRole = await testObjects.createTestRole({
			name: 'test_base',
			roles: [],
			permissions: ['TEST_BASE', 'TEST_BASE_2'],
		});

		const testSubrole = await testObjects.createTestRole({
			name: 'test_subrole',
			roles: [testRole._id],
			permissions: ['TEST_SUB'],
		});

		const user = await testObjects.createTestUser({
			roles: [testSubrole._id],
			firstName: 'Max',
			lastName: 'Tester',
		});

		const userFromDb = await userService.get(user._id);

		expect(userFromDb.avatarInitials).to.eq('MT');
		const array = Array.from(userFromDb.permissions);
		expect(array).to.have.lengthOf(3);
		expect(array).to.include('TEST_BASE', 'TEST_BASE_2', 'TEST_SUB');
	});

	describe('GET', () => {
		it('student can read himself', async () => {
			const student = await testObjects.createTestUser({
				roles: ['student'],
				birthday: Date.now(),
				ldapId: 'thisisauniqueid',
			});
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = {};
			const result = await app.service('users').get(student._id, params);
			expect(result).to.not.to.equal(undefined);
			expect(result).to.haveOwnProperty('firstName');
			expect(result).to.haveOwnProperty('lastName');
			expect(result).to.haveOwnProperty('displayName');
			expect(result).to.haveOwnProperty('email');
			expect(result).to.haveOwnProperty('birthday');
			expect(result).to.haveOwnProperty('ldapId');
		});

		it('student can not read admin email', async () => {
			const student = await testObjects.createTestUser({
				roles: ['student'],
				birthday: Date.now(),
				ldapId: 'thisisauniqueid',
				schoolId: new ObjectId('5f2987e020834114b8efd6f8'), // admin school id
			});
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = {};
			const result = await app.service('users').get('0000d213816abba584714c0a', params); // admin user id
			expect(result.email).to.equal(undefined);
		});

		it('student can not read student from foreign school', async () => {
			await testObjects.createTestRole({
				name: 'studentList',
				permissions: ['STUDENT_LIST'],
			});
			const school = await testObjects.createTestSchool({
				name: 'testSchool1',
			});
			const otherSchool = await testObjects.createTestSchool({
				name: 'testSchool2',
			});
			const student = await testObjects.createTestUser({ roles: ['studentList'], schoolId: school._id });
			const otherStudent = await testObjects.createTestUser({ roles: ['student'], schoolId: otherSchool._id });
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = {};
			try {
				await app.service('users').get(otherStudent._id, params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.message).to.equal(testGenericErrorMessage);
				expect(err.code).to.equal(403);
			}
		});

		// https://ticketsystem.dbildungscloud.de/browse/SC-5074
		xit('student can not read unknown student', async () => {
			await testObjects.createTestRole({
				name: 'studentList',
				permissions: ['STUDENT_LIST'],
			});
			const student = await testObjects.createTestUser({ roles: ['studentList'] });
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = {};
			try {
				await app.service('users').get('AAAAAAAAAAAAAAAAAAAAAAAAAAA', params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.message).to.equal(testGenericErrorMessage);
				expect(err.code).to.equal(403);
			}
		});

		it('student can read other student with STUDENT_LIST permission', async () => {
			await testObjects.createTestRole({
				name: 'studentList',
				permissions: ['STUDENT_LIST'],
			});
			const student = await testObjects.createTestUser({ roles: ['studentList'] });
			const otherStudent = await testObjects.createTestUser({ roles: ['student'], birthday: Date.now() });
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = {};
			const result = await app.service('users').get(otherStudent._id, params);
			expect(result).to.not.to.equal(undefined);
			expect(result).to.haveOwnProperty('firstName');
			expect(result).to.haveOwnProperty('lastName');
			expect(result).to.haveOwnProperty('displayName');
			expect(result).not.to.haveOwnProperty('email');
			expect(result).not.to.haveOwnProperty('birthday');
			expect(result).not.to.haveOwnProperty('ldapId');
		});

		it('does not allow students to read other students without STUDENT_LIST permission', async () => {
			await testObjects.createTestRole({ name: 'notAuthorized', permissions: [] });
			const studentToRead = await testObjects.createTestUser({ roles: ['student'] });
			const actingUser = await testObjects.createTestUser({ roles: ['notAuthorized'] });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			params.query = {};
			try {
				await app.service('users').get(studentToRead._id, params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				// https://ticketsystem.dbildungscloud.de/browse/SC-5076
				// expect(err.message).to.equal(testGenericErrorMessage);
				expect(err.code).to.equal(403);
			}
		});

		it('teacher can read student', async () => {
			const teacher = await testObjects.createTestUser({ roles: ['teacher'] });
			const student = await testObjects.createTestUser({ roles: ['student'], birthday: Date.now() });
			const params = await testObjects.generateRequestParamsFromUser(teacher);
			params.query = {};
			const result = await app.service('users').get(student._id, params);
			expect(result).to.not.to.equal(undefined);
			expect(result).to.haveOwnProperty('firstName');
			expect(result).to.haveOwnProperty('lastName');
			expect(result).to.haveOwnProperty('displayName');
			expect(result).not.to.haveOwnProperty('ldapId');
		});

		// https://ticketsystem.dbildungscloud.de/browse/SC-5163
		// See linked implementation issue if needed!
		xit('teacher can not read other teacher', async () => {
			const teacher = await testObjects.createTestUser({ roles: ['teacher'] });
			const otherTeacher = await testObjects.createTestUser({ roles: ['teacher'] });
			const params = await testObjects.generateRequestParamsFromUser(teacher);
			params.query = {};
			try {
				await app.service('users').get(otherTeacher._id, params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.message).to.equal(testGenericErrorMessage);
				expect(err.code).to.equal(403);
			}
		});

		// https://ticketsystem.dbildungscloud.de/browse/SC-5163
		// See linked implementation issue if needed!
		xit('teacher can not read admin', async () => {
			const teacher = await testObjects.createTestUser({ roles: ['teacher'] });
			const params = await testObjects.generateRequestParamsFromUser(teacher);
			params.query = {};
			try {
				await app.service('users').get('0000d213816abba584714c0a', params); // admin user id
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.message).to.equal(testGenericErrorMessage);
				expect(err.code).to.equal(403);
			}
		});

		// https://ticketsystem.dbildungscloud.de/browse/SC-5163
		// See linked implementation issue if needed!
		xit('teacher can not read superhero', async () => {
			const teacher = await testObjects.createTestUser({ roles: ['teacher'] });
			const params = await testObjects.generateRequestParamsFromUser(teacher);
			params.query = {};
			try {
				await app.service('users').get('0000d231816abba584714c9c', params); // superhero user id
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.message).to.equal(testGenericErrorMessage);
				expect(err.code).to.equal(403);
			}
		});

		it('teacher can not read student from foreign school', async () => {
			await testObjects.createTestRole({
				name: 'studentList',
				permissions: ['STUDENT_LIST'],
			});
			const school = await testObjects.createTestSchool({
				name: 'testSchool1',
			});
			const otherSchool = await testObjects.createTestSchool({
				name: 'testSchool2',
			});
			const student = await testObjects.createTestUser({ roles: ['teacher'], schoolId: school._id });
			const otherStudent = await testObjects.createTestUser({ roles: ['student'], schoolId: otherSchool._id });
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = {};
			try {
				await app.service('users').get(otherStudent._id, params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.message).to.equal(testGenericErrorMessage);
				expect(err.code).to.equal(403);
			}
		});

		it('should throws an error, when performing GET with populate in query params', async () => {
			const student = await testObjects.createTestUser({
				roles: ['student'],
				birthday: Date.now(),
				ldapId: 'thisisauniqueid',
			});
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = { $populate: 'not_whitelisted' };
			try {
				await app.service('users').get(student._id, params);
				throw new Error('should have failed.');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed.');
				expect(err.message).equal('populate not supported');
				expect(err.code).to.equal(400);
			}
		});

		it('should NOT throws an error, when performing GET with whitelisted value of populate field', async () => {
			const student = await testObjects.createTestUser({
				roles: ['student'],
				birthday: Date.now(),
				ldapId: 'thisisauniqueid',
			});
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = { $populate: 'roles' };
			const result = await app.service('users').get(student._id, params);
			expect(result).to.haveOwnProperty('firstName');
			expect(result).to.haveOwnProperty('lastName');
			expect(result).to.haveOwnProperty('displayName');
			expect(result).to.haveOwnProperty('email');
			expect(result).to.haveOwnProperty('birthday');
			expect(result).to.haveOwnProperty('ldapId');
		});
	});

	describe('FIND', () => {
		// https://ticketsystem.dbildungscloud.de/browse/SC-3929
		it('does not allow population', async () => {
			const student = await testObjects.createTestUser({ roles: ['student'] });
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = {
				$populate: ['5f2987e020834114b8efd6f8', 'roles'],
			};
			try {
				await app.service('users').find(params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.message).to.equal('populate not supported');
				expect(err.code).to.equal(400);
			}
		});

		xit('can not populate school', async () => {
			const { _id: schoolId } = await testObjects.createTestSchool({});
			const teacher = await testObjects.createTestUser({ roles: ['teacher'], schoolId });
			const params = await testObjects.generateRequestParamsFromUser(teacher);
			params.query = { $populate: ['schoolId'] };
			try {
				await app.service('users').find(params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should not have failed');
				expect(err.code).to.equal(400);
				expect(err.message).to.equal('populate not supported');
			}
		});

		it('does not allow students who may not create teams list other users', async () => {
			const student = await testObjects.createTestUser({ roles: ['student'] });
			const studentParams = await testObjects.generateRequestParamsFromUser(student);
			studentParams.query = {};

			await app.service('schools').patch(student.schoolId, { enableStudentTeamCreation: false });

			await expect(app.service('users').find(studentParams)).to.be.rejectedWith(
				Error,
				'The current user is not allowed to list other users!'
			);
		});

		it('allows students who may create teams list other users', async () => {
			const school = await testObjects.createTestSchool();
			const student = await testObjects.createTestUser({ roles: ['student'], schoolId: school._id });
			const studentParams = await testObjects.generateRequestParamsFromUser(student);
			studentParams.query = {};
			Configuration.set('STUDENT_TEAM_CREATION', 'enabled');

			await app.service('schools').patch(student.schoolId, { enableStudentTeamCreation: true });

			const studentResults = await app.service('users').find(studentParams);
			expect(studentResults.data).to.have.lengthOf(1);
		});
	});

	describe('CREATE', () => {
		it('can create student with STUDENT_CREATE', async () => {
			const { _id: schoolId } = await testObjects.createTestSchool();
			await testObjects.createTestRole({
				name: 'studentCreate',
				permissions: ['STUDENT_CREATE'],
			});
			const actingUser = await testObjects.createTestUser({ roles: ['studentCreate'], schoolId });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			const data = {
				firstName: 'Luke',
				lastName: 'Skywalker',
				schoolId,
				roles: ['student'],
				email: `${Date.now()}@test.org`,
			};
			const result = await app.service('users').create(data, params);
			expect(result).to.not.to.equal(undefined);
			expect(result._id).to.not.to.equal(undefined);
		});

		it('can fails to create user on other school', async () => {
			const { _id: schoolId } = await testObjects.createTestSchool();
			const { _id: otherSchoolId } = await testObjects.createTestSchool();
			await testObjects.createTestRole({
				name: 'studentCreate',
				permissions: ['STUDENT_CREATE'],
			});
			const actingUser = await testObjects.createTestUser({ roles: ['studentCreate'], schoolId });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			const data = {
				firstName: 'Leia',
				lastName: 'Skywalker',
				schoolId: otherSchoolId,
				roles: ['student'],
				email: `${Date.now()}@test.org`,
			};
			try {
				await app.service('users').create(data, params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.code).to.equal(403);
				expect(err.message).to.equal('You do not have valid permissions to access this.');
			}
		});

		it('superhero can create admin', async () => {
			const hero = await testObjects.createTestUser({ roles: ['superhero'] });
			const { _id: schoolId } = await testObjects.createTestSchool();
			const params = await testObjects.generateRequestParamsFromUser(hero);
			const user = await app.service('users').create(
				{
					schoolId,
					email: `${Date.now()}@testadmin.org`,
					firstName: 'Max',
					lastName: 'Tester',
					roles: ['administrator'],
				},
				params
			);
			expect(user).to.not.equal(undefined);
			expect(user._id).to.not.equal(undefined);
		});

		it('should throws an error, when performing CREATE with populate in query params', async () => {
			const hero = await testObjects.createTestUser({ roles: ['superhero'] });
			const { _id: schoolId } = await testObjects.createTestSchool();
			const params = await testObjects.generateRequestParamsFromUser(hero);

			params.query = { $populate: 'not_whitelisted' };
			try {
				await app.service('users').create(
					{
						schoolId,
						email: `${Date.now()}@testadmin.org`,
						firstName: 'Max',
						lastName: 'Tester',
						roles: ['administrator'],
					},
					params
				);
				throw new Error('should have failed.');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed.');
				expect(err.message).equal('populate not supported');
				expect(err.code).to.equal(400);
			}
		});
	});

	describe('PATCH', () => {
		it('rejects on group patching', async () => {
			await userService.patch(null, { email: 'test' }).catch((err) => {
				expect(err).to.not.equal(undefined);
				expect(err.message).to.equal('Operation on this service requires an id!');
			});
		});

		it('student can edit himself', async () => {
			const student = await testObjects.createTestUser({ roles: ['student'] });
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = {};
			const result = await app.service('users').patch(student._id, { firstName: 'Bruce' }, params);
			expect(result).to.not.to.equal(undefined);
			expect(result.firstName).to.equal('Bruce');
		});

		it('ignore schoolId', async () => {
			const { _id: schoolId } = await testObjects.createTestSchool();
			const { _id: otherSchoolId } = await testObjects.createTestSchool();
			const targetUser = await testObjects.createTestUser({ roles: ['student'], schoolId });
			const actingUser = await testObjects.createTestUser({ roles: ['administrator'], schoolId });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);

			const result = await app.service('users').patch(targetUser._id, { schoolId: otherSchoolId }, params);
			expect(equalIds(result.schoolId, schoolId)).to.equal(true);
		});

		it('ignore roles', async () => {
			const { _id: schoolId } = await testObjects.createTestSchool();
			const targetUser = await testObjects.createTestUser({ roles: ['student'], schoolId });
			const actingUser = await testObjects.createTestUser({ roles: ['administrator'], schoolId });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);

			await app.service('users').patch(targetUser._id, { roles: ['superhero'] }, params);
			const result = await app.service('users').get(targetUser._id, { query: { $populate: 'roles' } });
			expect(result.roles[0].name).to.equal('student');
		});

		it('fail to patch user on other school', async () => {
			const school = await testObjects.createTestSchool();
			const otherSchool = await testObjects.createTestSchool();
			const studentToDelete = await testObjects.createTestUser({ roles: ['student'], schoolId: otherSchool._id });
			const actingUser = await testObjects.createTestUser({ roles: ['administrator'], schoolId: school._id });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);

			try {
				await app.service('users').patch(studentToDelete._id, { lastName: 'Vader' }, params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.code).to.equal(404);
				expect(err.message).to.equal(`no record found for id '${studentToDelete._id.toString()}'`);
			}
		});

		it('should throws an error, when performing PATCH with populate in query params', async () => {
			const student = await testObjects.createTestUser({
				roles: ['student'],
				birthday: Date.now(),
				ldapId: 'thisisauniqueid',
			});
			const params = await testObjects.generateRequestParamsFromUser(student);
			params.query = { $populate: 'not_whitelisted' };
			try {
				await app.service('users').patch(student._id, { lastName: 'Vader' }, params);
				throw new Error('should have failed.');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed.');
				expect(err.message).equal('populate not supported');
				expect(err.code).to.equal(400);
			}
		});
	});

	describe('REMOVE', () => {
		it('user gets removed from classes and courses after delete', async () => {
			const userToDelete = await testObjects.createTestUser({ roles: ['student'] });
			const userId = userToDelete._id.toString();
			const { _id: classId } = await testObjects.createTestClass({ userIds: userToDelete._id });
			const { _id: courseId } = await testObjects.createTestCourse({ userIds: userToDelete._id });

			await userService.remove(userId);

			const [course, klass] = await Promise.all([classesService.get(classId), coursesService.get(courseId)]);

			expect(course.userIds.map((id) => id.toString())).to.not.include(userId);
			expect(klass.userIds.map((id) => id.toString())).to.not.include(userId);
		});

		it('fail to delete single student without STUDENT_DELETE permission', async () => {
			await testObjects.createTestRole({ name: 'notAuthorized', permissions: [] });
			const studentToDelete = await testObjects.createTestUser({ roles: ['student'] });
			const actingUser = await testObjects.createTestUser({ roles: ['notAuthorized'] });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			params.query = {};

			try {
				await app.service('users').remove(studentToDelete._id, params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.code).to.equal(403);
				expect(err.message).to.equal('you dont have permission to delete this user!');
			}
		});

		it('can delete single student with STUDENT_DELETE permission', async () => {
			await testObjects.createTestRole({
				name: 'studentDelete',
				permissions: ['STUDENT_DELETE'],
			});
			const studentToDelete = await testObjects.createTestUser({ roles: ['student'], manualCleanup: true });
			const actingUser = await testObjects.createTestUser({ roles: ['studentDelete'] });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			params.query = {};

			try {
				const result = await app.service('users').remove(studentToDelete._id, params);
				expect(result).to.not.to.equal(undefined);
				expect(result._id.toString()).to.equal(studentToDelete._id.toString());
			} catch (err) {
				// in case of error, make sure user gets deleted
				testObjects.createdUserIds.push(studentToDelete._id);
				throw new Error('should not have failed');
			}
		});

		it('fail to  single teacher without TEACHER_DELETE permission', async () => {
			await testObjects.createTestRole({ name: 'notAuthorized', permissions: ['STUDENT_DELETE'] });
			const studentToDelete = await testObjects.createTestUser({ roles: ['teacher'] });
			const actingUser = await testObjects.createTestUser({ roles: ['notAuthorized'] });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			params.query = {};

			try {
				await app.service('users').remove(studentToDelete._id, params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.code).to.equal(403);
				expect(err.message).to.equal('you dont have permission to delete this user!');
			}
		});

		it('can delete single teacher with TEACHER_DELETE permission', async () => {
			await testObjects.createTestRole({
				name: 'teacherDelete',
				permissions: ['TEACHER_DELETE'],
			});
			const studentToDelete = await testObjects.createTestUser({ roles: ['teacher'], manualCleanup: true });
			const actingUser = await testObjects.createTestUser({ roles: ['teacherDelete'] });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			params.query = {};

			try {
				const result = await app.service('users').remove(studentToDelete._id, params);
				expect(result).to.not.to.equal(undefined);
				expect(result._id.toString()).to.equal(studentToDelete._id.toString());
			} catch (err) {
				// in case of error, make sure user gets deleted
				testObjects.createdUserIds.push(studentToDelete._id);
				throw new Error('should not have failed');
			}
		});

		it('fail to delete user on other school', async () => {
			const school = await testObjects.createTestSchool();
			const otherSchool = await testObjects.createTestSchool();
			const studentToDelete = await testObjects.createTestUser({ roles: ['student'], schoolId: otherSchool._id });
			const actingUser = await testObjects.createTestUser({ roles: ['administrator'], schoolId: school._id });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			params.query = {};
			try {
				await app.service('users').remove(studentToDelete._id, params);
				throw new Error('should have failed');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed');
				expect(err.code).to.equal(404);
				expect(err.message).to.equal(`no record found for id '${studentToDelete._id.toString()}'`);
			}
		});

		it('should throws an error, when performing REMOVE with populate in query params', async () => {
			await testObjects.createTestRole({
				name: 'studentDelete',
				permissions: ['STUDENT_DELETE'],
			});
			const studentToDelete = await testObjects.createTestUser({ roles: ['student'], manualCleanup: true });
			const actingUser = await testObjects.createTestUser({ roles: ['studentDelete'] });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			params.query = { $populate: 'not_whitelisted' };

			try {
				await app.service('users').remove(studentToDelete._id, params);
				throw new Error('should have failed.');
			} catch (err) {
				expect(err.message).to.not.equal('should have failed.');
				// in case of error, make sure user gets deleted
				testObjects.createdUserIds.push(studentToDelete._id);
				expect(err.message).equal('populate not supported');
				expect(err.code).to.equal(400);
			}
		});
	});

	describe('bulk delete', () => {
		it('can delete multiple students when user has STUDENT_DELETE permission', async () => {
			await testObjects.createTestRole({
				name: 'studentDelete',
				permissions: ['STUDENT_DELETE'],
			});
			const userIds = await Promise.all([
				testObjects.createTestUser({ roles: ['student'], manualCleanup: true }).then((u) => u._id),
				testObjects.createTestUser({ roles: ['student'], manualCleanup: true }).then((u) => u._id),
			]);
			const actingUser = await testObjects.createTestUser({ roles: ['studentDelete'] });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			params.query = { _id: { $in: userIds } };
			params.adapter = { multi: ['remove'] };

			let result;
			try {
				result = await app.service('users').remove(null, params);
			} catch (err) {
				testObjects.createdUserIds.concat(userIds);
				throw new Error('should not have failed', err);
			}
			expect(result).to.not.to.equal(undefined);
			expect(Array.isArray(result)).to.equal(true);
			const resultUserIds = result.map((e) => e._id.toString());
			userIds.forEach((userId) => expect(resultUserIds).to.include(userId.toString()));
		});

		it('only deletes students when user has STUDENT_DELETE permission', async () => {
			await testObjects.createTestRole({
				name: 'studentDelete',
				permissions: ['STUDENT_DELETE'],
			});
			const userIds = await Promise.all([
				testObjects.createTestUser({ roles: ['student'], manualCleanup: true }).then((u) => u._id),
				testObjects.createTestUser({ roles: ['teacher'] }).then((u) => u._id),
			]);
			const actingUser = await testObjects.createTestUser({ roles: ['studentDelete'] });
			const params = await testObjects.generateRequestParamsFromUser(actingUser);
			params.query = { _id: { $in: userIds } };
			params.adapter = { multi: ['remove'] };

			let result;
			try {
				result = await app.service('users').remove(null, params);
			} catch (err) {
				testObjects.createdUserIds.concat(userIds);
				throw new Error('should not have failed', err);
			}
			expect(result).to.not.to.equal(undefined);
			expect(Array.isArray(result)).to.equal(true);
			const resultUserIds = result.map((e) => e._id.toString());
			expect(resultUserIds).to.include(userIds[0].toString());
			expect(resultUserIds).to.not.include(userIds[1].toString());
		});
	});

	describe('uniqueness check', () => {
		it('should reject new users with mixed-case variants of existing usernames', async () => {
			await testObjects.createTestUser({ email: 'existing@account.de' });
			const newUser = {
				firstName: 'Test',
				lastName: 'Testington',
				email: 'ExistinG@aCCount.de',
				schoolId: '5f2987e020834114b8efd6f8',
			};

			// This should use the user service and not the test helper
			await expect(testObjects.createTestUser(newUser)).to.be.rejectedWith(
				Error,
				'Die E-Mail Adresse ist bereits in Verwendung!'
			);
		});
	});

	afterEach(async () => {
		await testObjects.cleanup();
	});
});
