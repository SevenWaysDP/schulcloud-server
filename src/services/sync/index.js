const { authenticate } = require('@feathersjs/authentication');
const { iff, isProvider } = require('feathers-hooks-common');
const { static: staticContent } = require('@feathersjs/express');
const path = require('path');
const { Configuration } = require('@hpi-schul-cloud/commons');
const { BadRequest } = require('../../errors');
const { hasPermission } = require('../../hooks');
const Syncer = require('./strategies/Syncer');
const syncers = require('./strategies');
const getSyncLogger = require('./logger');
const { consumer } = require('./strategies/LDAPSyncerConsumer');
const UserAccountService = require('./services/UserAccountService');

module.exports = function setup(app) {
	app.set('syncersStrategies', syncers);

	class SyncService {
		find(params) {
			return this.respond(undefined, params);
		}

		create(data, params) {
			return this.respond(data, params);
		}

		async respond(data, params) {
			if (!params.query || !params.query.target) {
				throw new BadRequest('No target supplied');
			}
			const { target } = params.query;
			const logger = getSyncLogger(params.logStream);
			const instances = [];
			const stategies = app.get('syncersStrategies');

			stategies.forEach((StrategySyncer) => {
				if (StrategySyncer.respondsTo(target)) {
					const args = StrategySyncer.params(params, data);
					if (args) {
						instances.push(new StrategySyncer(app, {}, logger, ...args));
					} else {
						throw new Error(`Invalid params for ${StrategySyncer.name}: "${JSON.stringify(params)}"`);
					}
				}
			});

			if (instances.length === 0) {
				throw new Error(`No syncer responds to target "${target}"`);
			} else {
				const stats = await Promise.all(instances.map((instance) => instance.sync()));
				const aggregated = Syncer.aggregateStats(stats);
				logger.info(`Sync finished. Successful: ${aggregated.successful}, Errors: ${aggregated.failed}`);
				return Promise.resolve(stats);
			}
		}
	}

	app.use('/sync/userAccount', new UserAccountService(), { methods: [] });

	app.use('/sync/api', staticContent(path.join(__dirname, '/docs/openapi.yaml')));
	app.use('/sync', new SyncService());

	if (Configuration.get('FEATURE_SYNCER_CONSUMER_ENABLE') === true) {
		app.configure(consumer);
	}

	const syncService = app.service('/sync');
	syncService.hooks({
		before: {
			all: [
				iff(isProvider('external'), [
					authenticate('jwt', 'api-key'),
					iff((context) => context.account, hasPermission('SYNC_START')),
				]),
			],
		},
	});
};
