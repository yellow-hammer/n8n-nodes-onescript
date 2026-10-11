import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	{
		files: ['nodes/OneScript/runOscript.ts', 'nodes/OneScript/autumnSession.ts'],
		rules: {
			// spawn oscript без оболочки.
			'@n8n/community-nodes/no-dangerous-functions': 'off',
		},
	},
	{
		files: ['package.json'],
		rules: {
			// Транзитивные dev-зависимости @n8n/node-cli и release-it закрепляют
			// уязвимые axios, qs, uuid, basic-ftp, stream-json и handlebars.
			// Dependabot не может поднять их в пределах этих ограничений и падает
			// с security_update_not_possible. overrides ставят уже исправленные версии.
			'@n8n/community-nodes/no-overrides-field': 'off',
		},
	},
	{
		files: ['nodes/**/*.ts'],
		rules: {
			// Подписи ноды на русском. Правило требует английское «Whether».
			'n8n-nodes-base/node-param-description-boolean-without-whether': 'off',
		},
	},
];
