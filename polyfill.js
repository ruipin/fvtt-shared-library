// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-shared-library Rui Pinheiro

'use strict';

import { ERRORS } from '../errors/errors.js';


// game.user.data polyfill, so it can be used before 'ready'
export const game_user_data = function(return_null=false) {
	// Try game.user.data first
	const orig_game_user_data = globalThis.game?.user?.data;
	if(orig_game_user_data)
		return orig_game_user_data;

	// Grab the user ID
	const userid = globalThis.game?.userId ?? globalThis.game?.data?.userId;
	if(!userid) {
		if(return_null)
			return null;
		throw new ERRORS.internal("Unable to obtain the current user ID");
	}

	// Find user in game.data.users
	const user_data = globalThis.game?.data?.users?.find((x) => { return x._id == userid });
	if(!user_data) {
		if(return_null)
			return null;
		throw new ERRORS.internal("Unable to obtain the current user data object");
	}

	// Done
	return user_data;
}

// game.user.can polyfill, so it can be used before 'ready'
export const game_user_can = function(action, return_null=false) {
	// Try game.user.can first
	const orig_game_user_can = globalThis.game?.user?.can;
	if(orig_game_user_can)
		return orig_game_user_can.call(game.user, action);

	// Obtain game.user.data
	const user_data = game_user_data(return_null);
	if(!user_data)
		return null;

	// Check if user is GM
	if(user_data.role === 4)
		return true;

	// Check if the action is in the per-user permissions
	if(action in user_data.permissions) return user_data.permissions[action];

	// Otherwise, check the role's permissions
	const game_permissions_str = globalThis.game?.data?.settings?.find((x) => { return x.key === 'core.permissions'});
	if(game_permissions_str?.value) {
		const game_permissions = JSON.parse(game_permissions_str.value);

		const rolePerms = game_permissions[action];
		if(rolePerms && rolePerms.includes(user_data.role))
			return true;
	}

	return false;
}

// game.user.isGM polyfill, so it can be used before 'ready'
export const game_user_isGM = function(return_null=false) {
	// Try game.user.isGM first
	const orig_game_user_isGM = globalThis.game?.user?.isGM;
	if(orig_game_user_isGM !== undefined)
		return orig_game_user_isGM;

	// Obtain game.user.data
	const user_data = game_user_data(return_null);
	if(!user_data)
		return null;

	// Done
	return user_data.role === 4;
}

// Polyfill to get the Foundry version
export const game_release_display = function(return_null=true) {
	const display =
		globalThis.game?.release?.display ??
		globalThis.game?.version          ??
		globalThis.game?.data?.version    ??
		null
	;

	if(!return_null && display === null)
		throw new ERRORS.internal("Unable to obtain the Foundry display version");

	return display;
}

export const game_version = function(return_null=true) {
	const version =
		globalThis.game?.version          ??
		globalThis.game?.release?.version ??
		globalThis.game?.data?.version    ??
		null
	;

	if(!return_null && version === null)
		throw new ERRORS.internal("Unable to obtain the Foundry version");

	return version;
}


// Polyfill to get module settings (allows accessing settings before 'init' if they are client-scoped)
export const game_settings_get = function(namespace, key, always_fallback=false, return_null=true) {
	// Try game.settings.get first
	try {
		const orig_game_settings_get = globalThis.game?.settings?.get;
		if(orig_game_settings_get)
			return orig_game_settings_get.call(game.settings, namespace, key);
	}
	catch(e) {
		if(!always_fallback)
			throw e;
	}

	// Access localStorage to get the client-scoped version of the setting
	const storage_key = `${namespace}.${key}`;

	try {
		const data = globalThis.localStorage?.[storage_key];
		if(data === undefined || data === null) {
			if(return_null)
				return null;
			throw new ERRORS.internal(`Unable to obtain the setting '${storage_key}'`);
		}

		// Parse the localStorage data the same way as Core does
		const json_data = JSON.parse(data)
		if(json_data === undefined || json_data === null) {
			if(return_null)
				return null;
			throw new ERRORS.internal(`Unable to obtain the setting '${storage_key}'`);
		}

		// Done
		return json_data;
	}
	catch(e) {
		if(return_null)
			return null;
		throw new ERRORS.internal(`Unable to obtain the setting '${storage_key}' due to exception in polyfill:`, e);
	}
}

// Polyfill to support FVTT<12 and FVTT>=12
export const isNewerVersion = function(...args) {
	return foundry?.utils?.isNewerVersion?.(...args) ?? globalThis.isNewerVersion(...args);
}