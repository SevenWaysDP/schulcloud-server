import { Logger } from '@core/logger';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { teamFactory, teamUserFactory } from '@modules/team/testing';
import { Test, TestingModule } from '@nestjs/testing';
import { setupEntities } from '@testing/database';
import { TeamEntity, TeamRepo } from '../../repo';
import { TeamService } from './team.service';

describe('TeamService', () => {
	let module: TestingModule;
	let service: TeamService;

	let teamRepo: DeepMocked<TeamRepo>;

	beforeAll(async () => {
		await setupEntities([TeamEntity]);

		module = await Test.createTestingModule({
			providers: [
				TeamService,
				{
					provide: TeamRepo,
					useValue: createMock<TeamRepo>(),
				},
				{
					provide: Logger,
					useValue: createMock<Logger>(),
				},
			],
		}).compile();

		service = module.get(TeamService);
		teamRepo = module.get(TeamRepo);
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	afterAll(async () => {
		await module.close();
	});

	describe('findUserDataFromTeams', () => {
		describe('when finding by userId', () => {
			const setup = () => {
				const teamUser = teamUserFactory.buildWithId();
				const team1 = teamFactory.withTeamUser([teamUser]).build();
				const team2 = teamFactory.withTeamUser([teamUser]).build();

				teamRepo.findByUserId.mockResolvedValue([team1, team2]);

				return {
					teamUser,
				};
			};

			it('should call teamRepo.findByUserId', async () => {
				const { teamUser } = setup();

				await service.findUserDataFromTeams(teamUser.user.id);

				expect(teamRepo.findByUserId).toBeCalledWith(teamUser.user.id);
			});

			it('should return array of two teams with user', async () => {
				const { teamUser } = setup();

				const result = await service.findUserDataFromTeams(teamUser.user.id);

				expect(result.length).toEqual(2);
			});
		});
	});
});
