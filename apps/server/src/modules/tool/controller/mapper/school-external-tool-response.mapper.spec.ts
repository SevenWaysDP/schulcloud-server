import { schoolExternalToolDOFactory } from '@shared/testing/factory/domainobject/school-external-tool.factory';
import { SchoolExternalToolDO } from '@shared/domain/domainobject/external-tool/school-external-tool.do';
import { SchoolExternalToolResponseMapper } from './school-external-tool-response.mapper';
import {
	SchoolExternalToolResponse,
	SchoolExternalToolSearchListResponse,
	SchoolExternalToolStatusResponse,
} from '../dto';

describe('SchoolExternalToolResponseMapper', () => {
	let mapper: SchoolExternalToolResponseMapper;

	beforeAll(() => {
		mapper = new SchoolExternalToolResponseMapper();
	});

	const setup = () => {
		const do1: SchoolExternalToolDO = schoolExternalToolDOFactory.buildWithId();
		const do2: SchoolExternalToolDO = schoolExternalToolDOFactory.buildWithId();

		const dos: SchoolExternalToolDO[] = [do1, do2];

		return {
			dos,
			do1,
			do2,
		};
	};

	describe('mapToSearchListResponse is called', () => {
		it('should return a schoolExternalToolResponse', () => {
			const response: SchoolExternalToolSearchListResponse = mapper.mapToSearchListResponse([]);

			expect(response).toBeInstanceOf(SchoolExternalToolSearchListResponse);
		});

		describe('when parameter are given', () => {
			it('should map domain objects correctly', () => {
				const { dos, do1, do2 } = setup();
				do2.status = undefined;

				const response: SchoolExternalToolSearchListResponse = mapper.mapToSearchListResponse(dos);

				expect(response.data).toEqual(
					expect.objectContaining<SchoolExternalToolResponse[]>([
						{
							id: do1.id as string,
							name: do1.name as string,
							schoolId: do1.schoolId,
							toolId: do1.toolId,
							toolVersion: do1.toolVersion,
							parameters: [
								{
									name: do1.parameters[0].name,
									value: do1.parameters[0].value,
								},
							],
							status: SchoolExternalToolStatusResponse.LATEST,
						},
						{
							id: do2.id as string,
							name: do2.name as string,
							schoolId: do2.schoolId,
							toolId: do2.toolId,
							toolVersion: do2.toolVersion,
							parameters: [
								{
									name: do2.parameters[0].name,
									value: do2.parameters[0].value,
								},
							],
							status: SchoolExternalToolStatusResponse.UNKNOWN,
						},
					])
				);
			});
		});

		describe('when optional parameter are missing', () => {
			it('should set defaults', () => {
				const { dos, do1 } = setup();
				do1.id = undefined;
				do1.name = undefined;
				do1.status = undefined;

				const response: SchoolExternalToolSearchListResponse = mapper.mapToSearchListResponse(dos);

				expect(response.data[0]).toEqual(
					expect.objectContaining({
						id: '',
						name: '',
						status: SchoolExternalToolStatusResponse.UNKNOWN,
					})
				);
			});
		});
	});
});
