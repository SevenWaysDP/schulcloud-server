import { Module } from '@nestjs/common';
import { LoggerModule } from '@core/logger';
import { EncryptionModule } from '@infra/encryption';
import { ConsoleWriterModule } from '@infra/console';
import { AccountModule } from '@modules/account';
import { SystemModule } from '@modules/system';
import { KeycloakAdministrationModule } from '../keycloak-administration/keycloak-administration.module';
import { KeycloakConsole } from './console/keycloak-configuration.console';
import { KeycloakConfigurationInputFiles } from './interface/keycloak-configuration-input-files.interface';
import KeycloakConfiguration from './keycloak-config';
import { OidcIdentityProviderMapper } from './mapper/identity-provider.mapper';
import { KeycloakConfigurationService } from './service/keycloak-configuration.service';
import { KeycloakSeedService } from './service/keycloak-seed.service';
import { KeycloakConfigurationUc } from './uc/keycloak-configuration.uc';
import { KeycloakManagementController } from './controller/keycloak-configuration.controller';
import { KeycloakMigrationService } from './service/keycloak-migration.service';

@Module({
	imports: [
		KeycloakAdministrationModule,
		LoggerModule,
		EncryptionModule,
		ConsoleWriterModule,
		SystemModule,
		AccountModule,
	],
	controllers: [KeycloakManagementController],
	providers: [
		{
			provide: KeycloakConfigurationInputFiles,
			useValue: KeycloakConfiguration.keycloakInputFiles,
		},
		OidcIdentityProviderMapper,
		KeycloakConfigurationUc,
		KeycloakConfigurationService,
		KeycloakMigrationService,
		KeycloakSeedService,
		KeycloakConsole,
	],
	exports: [KeycloakConsole, KeycloakConfigurationService, KeycloakSeedService],
})
export class KeycloakConfigurationModule {}
