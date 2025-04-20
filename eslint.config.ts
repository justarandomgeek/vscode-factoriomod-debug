import globals from "globals";
import tseslint from 'typescript-eslint';
import stylisticTs from '@stylistic/eslint-plugin-ts';

export default tseslint.config([
	...tseslint.configs.recommended,
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

			"no-unused-expressions": ["error", {
				allowShortCircuit: true,
				allowTernary: true,
			}],
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": "off",

			"no-var": "error",

			"@typescript-eslint/consistent-type-imports": ["error", {
				disallowTypeAnnotations: true,
				fixStyle: 'separate-type-imports',
				prefer: 'type-imports',
			}],
			"@typescript-eslint/consistent-type-exports": "error",
		},
	}]);