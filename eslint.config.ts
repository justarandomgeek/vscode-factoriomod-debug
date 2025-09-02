import { globalIgnores, defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from 'typescript-eslint';
import stylisticTs from '@stylistic/eslint-plugin';

export default defineConfig([
	globalIgnores(["dist", "coverage", "test/factorio"]),
	...tseslint.configs.recommendedTypeChecked,
	{
		plugins: {
			"@stylistic/ts": stylisticTs,
		},

		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},

			ecmaVersion: 2022,
			sourceType: "module",

			parserOptions: {
				project: "./tsconfig.json",
			},
		},

		rules: {
			"@stylistic/ts/member-delimiter-style": ["error", {
				multiline: {
					delimiter: "none",
					requireLast: true,
				},

				singleline: {
					delimiter: "semi",
					requireLast: false,
				},
			}],


			"@stylistic/ts/semi": ["error"],
			"brace-style": ["error", "1tbs", {
				allowSingleLine: true,
			}],

			"block-spacing": "error",
			"space-before-blocks": "error",
			"keyword-spacing": "error",

			"arrow-spacing": ["error", {
				before: false,
				after: false,
			}],

			"switch-colon-spacing": "error",
			"comma-spacing": "error",
			"comma-style": "error",

			"comma-dangle": ["error", {
				arrays: "always-multiline",
				objects: "always-multiline",
				imports: "always-multiline",
				exports: "always-multiline",
				functions: "only-multiline",
			}],

			"key-spacing": "error",

			indent: ["error", "tab", {
				SwitchCase: 1,
				flatTernaryExpressions: true,
			}],

			curly: "error",
			eqeqeq: ["error", "always"],
			"no-bitwise": "error",
			"no-redeclare": "off",
			"@typescript-eslint/no-redeclare": "error",

			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/restrict-template-expressions": "off",

			"no-var": "error",

			"@typescript-eslint/consistent-type-imports": ["error", {
				disallowTypeAnnotations: true,
				fixStyle: 'separate-type-imports',
				prefer: 'type-imports',
			}],
			"@typescript-eslint/consistent-type-exports": "error",

			"@typescript-eslint/no-deprecated": "error",
			"@typescript-eslint/no-extraneous-class": "error",
		},
	}]);