const { expect } = require('chai');
const { Configuration } = require('@hpi-schul-cloud/commons');
const appPromise = require('../../../../src/app');
const testObjects = require('../../helpers/testObjects')(appPromise());
const { setupNestServices, closeNestServices } = require('../../../utils/setup.nest.services');
const { generateRequestParamsFromUser, generateRequestParams } = require('../../helpers/services/login')(appPromise());

const HOST = Configuration.get('HOST');

const checkQrContentLinkFormat = (schoolId, hash, isStudent) => (contentLink) =>
	contentLink === `${HOST}/registration/${schoolId}${!isStudent ? '/byemployee' : ''}?importHash=${hash}`;

describe('qrRegistrationLinks service tests', () => {
	let app;
	let qrRegistrationLinksService;
	let accountService;
	let server;
	let nestServices;

	before(async () => {
		app = await appPromise();
		nestServices = await setupNestServices(app);
		qrRegistrationLinksService = app.service('/users/qrRegistrationLink');
		accountService = app.service('nest-account-service');
		server = await app.listen(0);
	});

	after(async () => {
		await server.close();
		await closeNestServices(nestServices);
	});

	const postRegistrationLinks = (requestParams, userIds, roleName = 'teacher', selectionType = 'inclusive') =>
		qrRegistrationLinksService.create(
			{
				userIds,
				roleName,
				selectionType,
			},
			requestParams,
			app
		);

	describe('CREATE', () => {
		it('should return Forbidden when user without permission tries to generate registration links', async () => {
			const testUser = await testObjects.createTestUser();
			const userRequestAuthentication = await generateRequestParamsFromUser(testUser);

			try {
				await postRegistrationLinks(userRequestAuthentication, [testUser._id]);
				expect.fail('Forbidden exception expected');
			} catch (err) {
				expect(err.code).to.equal(403);
				expect(err.name).to.equal('Forbidden');
				expect(err.message).to.equal("You don't have one of the permissions: STUDENT_LIST, TEACHER_LIST.");
			}
		});
		it('should return registration link for 1 user', async () => {
			const testUser = await testObjects.createTestUser({ roles: ['teacher'] });
			const testUser1 = await testObjects.createTestUser({ roles: ['student'] });
			const userRequestAuthentication = await generateRequestParamsFromUser(testUser);
			const res = await postRegistrationLinks(userRequestAuthentication, [testUser1._id], 'student');
			expect(res.length).to.equal(1);
		});

		it('should return a valid registration link for a student', async () => {
			const teacher = await testObjects.createTestUser({ roles: ['teacher'] });
			const student = await testObjects.createTestUser({ roles: ['student'] });
			const userRequestAuthentication = await generateRequestParamsFromUser(teacher);
			const res = await postRegistrationLinks(userRequestAuthentication, [student._id], 'student');
			expect(res.length).to.equal(1);
			const response = res[0];
			expect(response.description).to.be.equal('Zum Registrieren bitte den Link öffnen.');
			expect(response.email).to.be.equal(student.email);
			expect(response.firstName).to.be.equal(student.firstName);
			expect(response.lastName).to.be.equal(student.lastName);
			expect(response.qrContent).satisfies(checkQrContentLinkFormat(student.schoolId.toString(), response.hash, true));
			expect(response.title).contains(student.firstName).and.contains(student.lastName);
		});

		it('should return a valid registration link for a teacher', async () => {
			const admin = await testObjects.createTestUser({ roles: ['administrator'] });
			const teacher = await testObjects.createTestUser({ roles: ['teacher'] });
			const userRequestAuthentication = await generateRequestParamsFromUser(admin);
			const res = await postRegistrationLinks(userRequestAuthentication, [teacher._id], 'teacher');
			expect(res.length).to.equal(1);
			const response = res[0];
			expect(response.description).to.be.equal('Zum Registrieren bitte den Link öffnen.');
			expect(response.email).to.be.equal(teacher.email);
			expect(response.firstName).to.be.equal(teacher.firstName);
			expect(response.lastName).to.be.equal(teacher.lastName);
			expect(response.qrContent).satisfies(checkQrContentLinkFormat(teacher.schoolId.toString(), response.hash, false));
			expect(response.title).contains(teacher.firstName).and.contains(teacher.lastName);
		});

		it('should return registration link for 3 users', async () => {
			const testUser = await testObjects.createTestUser({ roles: ['teacher'] });
			const testUser2 = await testObjects.createTestUser({ roles: ['teacher'] });
			const testUser3 = await testObjects.createTestUser({ roles: ['teacher'] });
			const testUser4 = await testObjects.createTestUser({ roles: ['teacher'] });
			const userRequestAuthentication = await generateRequestParamsFromUser(testUser);
			const res = await postRegistrationLinks(userRequestAuthentication, [testUser2._id, testUser3._id, testUser4._id]);
			expect(res.length).to.equal(3);
		});
		it('should return bad request if the id is invalid', async () => {
			const testUser = await testObjects.createTestUser({ roles: ['teacher'] });
			const userRequestAuthentication = await generateRequestParamsFromUser(testUser);
			try {
				await postRegistrationLinks(userRequestAuthentication, [`${testUser._id}_some_invalid_id`]);
				expect.fail('BadRequest expected!');
			} catch (err) {
				expect(err.code).to.equal(400);
				expect(err.name).to.equal('BadRequest');
				expect(err.message).to.equal('Can not generate QR registration links');
			}
		});
		it('should return empty array if user already has an account', async () => {
			const user = await testObjects.createTestUser({ roles: 'teacher' });
			const credentials = {
				username: user.email,
				password: user.email,
			};
			const testAccount = await testObjects.createTestAccount(credentials, null, user);
			const params = {
				...(await generateRequestParams(credentials)),
				query: {},
			};

			const resp = await postRegistrationLinks(params, [String(user._id)]);
			expect(resp.length).to.equal(0);
			await accountService.delete(testAccount.id);
		});

		it('should return registration link for all users (from the caller school) with a role given (stundent)', async () => {
			const { _id: schoolId } = await testObjects.createTestSchool();
			const callingUser = await testObjects.createTestUser({ roles: 'teacher', schoolId });
			const testUser1 = await testObjects.createTestUser({ roles: 'student', schoolId, firstName: 'register1' });
			const testUser2 = await testObjects.createTestUser({ roles: 'student', schoolId, firstName: 'register2' });
			const userRequestAuthentication = await generateRequestParamsFromUser(callingUser);
			const res = await postRegistrationLinks(userRequestAuthentication, [], 'student', 'exclusive');
			expect(res.length).to.equal(2);
			expect(res.filter((result) => result.firstName === testUser1.firstName).length).to.equal(1);
			expect(res.filter((result) => result.firstName === testUser2.firstName).length).to.equal(1);
		});

		it('should return registration link for all users (from the caller school) with a role given (teacher)', async () => {
			const { _id: schoolId } = await testObjects.createTestSchool();
			const callingUser = await testObjects.createTestUser({ roles: 'administrator', schoolId });
			const testUser1 = await testObjects.createTestUser({ roles: 'teacher', schoolId, firstName: 'TeacherRegister1' });
			const testUser2 = await testObjects.createTestUser({ roles: 'teacher', schoolId, firstName: 'TeacherRegister2' });
			const userRequestAuthentication = await generateRequestParamsFromUser(callingUser);
			// when
			const res = await postRegistrationLinks(userRequestAuthentication, [], 'teacher', 'exclusive');
			// then
			expect(res.length).to.equal(2);
			expect(res.filter((result) => result.firstName === testUser1.firstName).length).to.equal(1);
			expect(res.filter((result) => result.firstName === testUser2.firstName).length).to.equal(1);
		});

		it('should return bad request for unsuported role given (other than student or teacher)', async () => {
			const testUser = await testObjects.createTestUser({ roles: ['teacher'] });
			const userRequestAuthentication = await generateRequestParamsFromUser(testUser);

			try {
				await postRegistrationLinks(userRequestAuthentication, [], 'admin');
				expect.fail('BadRequest expected');
			} catch (err) {
				expect(err.code).to.equal(400);
				expect(err.name).to.equal('BadRequest');
				expect(err.message).to.equal('Can not generate QR registration links');
				expect(err.errors.message).to.equal('The given role is not supported');
			}
		});
	});

	afterEach(async () => {
		await testObjects.cleanup();
	});
});
