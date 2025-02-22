// account model is mirrored in account entity in the NestJS stack
// file: apps/server/src/shared/domain/entity/account.entity.ts

const mongoose = require('mongoose');
const { enableAuditLog } = require('../../utils/database');

const { Schema } = mongoose;

const accountSchema = new Schema(
	{
		username: {
			type: String,
			required: true,
			lowercase: true,
		},
		password: { type: String },

		token: { type: String },
		credentialHash: { type: String },

		userId: { type: Schema.Types.ObjectId, ref: 'user' },
		systemId: { type: Schema.Types.ObjectId, ref: 'system' }, // if systemId => SSO

		lasttriedFailedLogin: { type: Date, default: 0 },
		expiresAt: { type: Date },
		activated: { type: Boolean, default: false },
	},
	{
		timestamps: true,
	}
);

enableAuditLog(accountSchema);

const accountModel = mongoose.model('account', accountSchema);

module.exports = accountModel;
