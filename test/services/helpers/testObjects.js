const { ObjectId: generateObjectId } = require('mongoose').Types;

const logger = require('../../../src/logger/index');
const TestEventEmitter = require('./mongooseEventListener');

const serviceHelpers = require('./services');

const warn = (message, pass) => {
	logger.warning(message);
	return pass;
};

const performanceMessurceLimits = {
	chars: 500,
	time: 50,
	dbCalls: 5,
	paginate: 100,
};

module.exports = (app, opt = { schoolId: '5f2987e020834114b8efd6f8', generateObjectId }) => {
	const {
		accounts,
		activation,
		classes,
		consents,
		consentVersion,
		courses,
		courseGroups,
		roles,
		schools,
		years,
		schoolGroups,
		datasources,
		files,
		homeworks,
		lessons,
		login,
		registrationPins,
		ltiTools,
		problems,
		pseudonyms,
		storageProviders,
		submissions,
		teams,
		testSystem,
		users,
		importUsers,
	} = serviceHelpers(app, opt);

	const cleanup = () =>
		Promise.all(
			[
				accounts,
				activation,
				users,
				consents,
				consentVersion,
				testSystem,
				classes,
				courses,
				courseGroups,
				ltiTools,
				problems,
				pseudonyms,
				teams,
				registrationPins,
				roles,
				schools,
				schoolGroups,
				years,
				datasources,
				submissions,
				lessons,
				homeworks,
				storageProviders,
				files,
				importUsers,
			]
				.reverse()
				.map((factory) => factory.cleanup())
		)
			.then((res) => {
				logger.info('[TestObjects] cleanup data.');
				return res;
			})
			.catch((err) => {
				logger.warning('[TestObjects] Can not cleanup.', err);
				return err;
			});

	const info = () => ({
		accounts: accounts.info,
		activation: activation.info,
		classes: classes.info,
		courseGroups: courseGroups.info,
		courses: courses.info,
		datasources: datasources.info,
		files: files.info,
		homeworks: homeworks.info,
		lessons: lessons.info,
		registrationPins: registrationPins.info,
		ltiTools: ltiTools.info,
		problems: problems.info,
		pseudonyms: pseudonyms.info,
		schoolGroups: schoolGroups.info,
		schools: schools.info,
		storageProviders: storageProviders.info,
		submissions: submissions.info,
		teams: teams.info,
		tempPins: users.tempPinIds,
		testSystem: testSystem.info,
		users: users.info,
		years: years.info,
		importUsers: importUsers.info,
	});

	const createTestTeamWithOwner = async (userData) => {
		const user = await users.create(userData);
		const team = await teams.create(user);
		return { team, user };
	};

	const setupUser = async (userData) => {
		try {
			const user = await users.create(userData);
			const requestParams = await login.generateRequestParamsFromUser(user);
			const { account } = requestParams;

			return {
				user,
				account,
				requestParams,
				userId: user._id.toString(),
				accountId: account.id.toString(),
			};
		} catch (err) {
			logger.warning(err);
			return err;
		}
	};

	const rnd = () => Math.round(Math.random() * 10000);
	const randomGen = () => `${Date.now()}_${rnd()}`;

	return {
		createTestAccount: accounts.create,
		createTestActivation: activation.create,
		createTestClass: classes.create,
		createTestConsent: consents.create,
		createTestConsentVersion: consentVersion.create,
		createTestCourse: courses.create,
		createTestCourseGroup: courseGroups.create,
		createTestDatasource: datasources.create,
		createTestFile: files.create,
		createTestHomework: homeworks.create,
		createTestLesson: lessons.create,
		lessons,
		createTestRegistrationPin: registrationPins.create,
		createTestProblem: problems.create,
		createTestPseudonym: pseudonyms.create,
		createTestLtiTool: ltiTools.create,
		createTestRole: roles.create,
		createTestSchool: schools.create,
		createTestSchoolGroup: schoolGroups.create,
		createTestStorageProvider: storageProviders.create,
		createTestSubmission: submissions.create,
		createTestSystem: testSystem.create,
		createTestUser: users.create,
		createTestYear: years.create,
		cleanup,
		generateJWT: login.generateJWT,
		generateRequestParams: login.generateRequestParams,
		generateRequestParamsFromUser: login.generateRequestParamsFromUser,
		generateJWTFromUser: login.generateJWTFromUser,
		createdUserIds: warn('@deprecated use info() instead', users.info),
		teams,
		files,
		classes,
		schools,
		years,
		users,
		createTestTeamWithOwner,
		info,
		setupUser,
		options: opt,
		randomGen,
		generateObjectId,
		TestEventEmitter,
		performanceMessurceLimits,
		createTestImportUser: importUsers.create,
	};
};
