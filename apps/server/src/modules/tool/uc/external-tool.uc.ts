import { Injectable } from '@nestjs/common';
import { EntityId, IFindOptions, Permission, User } from '@shared/domain';
import { ExternalToolDO } from '@shared/domain/domainobject/external-tool';
import { AuthorizationService } from '@src/modules/authorization';
import { Page } from '@shared/domain/domainobject/page';
import { ExternalToolService, ExternalToolValidationService } from '../service';
import { CreateExternalTool, UpdateExternalTool } from './dto';

@Injectable()
export class ExternalToolUc {
	constructor(
		private readonly externalToolService: ExternalToolService,
		private readonly authorizationService: AuthorizationService,
		private readonly toolValidationService: ExternalToolValidationService
	) {}

	async createExternalTool(userId: EntityId, externalToolDO: CreateExternalTool): Promise<ExternalToolDO> {
		await this.ensurePermission(userId, Permission.TOOL_ADMIN);
		await this.toolValidationService.validateCreate(externalToolDO);

		const tool: Promise<ExternalToolDO> = this.externalToolService.createExternalTool(externalToolDO);
		return tool;
	}

	async updateExternalTool(
		userId: EntityId,
		toolId: string,
		externalTool: UpdateExternalTool
	): Promise<ExternalToolDO> {
		await this.ensurePermission(userId, Permission.TOOL_ADMIN);
		await this.toolValidationService.validateUpdate(toolId, externalTool);

		const loaded: ExternalToolDO = await this.externalToolService.findExternalToolById(toolId);
		const toUpdate: ExternalToolDO = new ExternalToolDO({ ...loaded, ...externalTool, version: loaded.version });

		const saved = await this.externalToolService.updateExternalTool(toUpdate, loaded);
		return saved;
	}

	async findExternalTool(
		userId: EntityId,
		query: Partial<ExternalToolDO>,
		options: IFindOptions<ExternalToolDO>
	): Promise<Page<ExternalToolDO>> {
		await this.ensurePermission(userId, Permission.TOOL_ADMIN);

		const tools: Page<ExternalToolDO> = await this.externalToolService.findExternalTools(query, options);
		return tools;
	}

	async getExternalTool(userId: EntityId, toolId: EntityId): Promise<ExternalToolDO> {
		await this.ensurePermission(userId, Permission.TOOL_ADMIN);

		const tool: ExternalToolDO = await this.externalToolService.findExternalToolById(toolId);
		return tool;
	}

	async deleteExternalTool(userId: EntityId, toolId: EntityId): Promise<void> {
		await this.ensurePermission(userId, Permission.TOOL_ADMIN);

		const promise: Promise<void> = this.externalToolService.deleteExternalTool(toolId);
		return promise;
	}

	private async ensurePermission(userId: EntityId, permission: Permission) {
		const user: User = await this.authorizationService.getUserWithPermissions(userId);
		this.authorizationService.checkAllPermissions(user, [permission]);
	}
}
