import type {
	CompletionParams,
	DefinitionParams,
} from 'vscode-languageserver/node';

import type {
	TextDocument,
} from 'vscode-languageserver-textdocument';
import type { LocaleLanguageService } from './Locale';

export class LuaLanguageService {
	constructor(
		private readonly Locale:LocaleLanguageService
	) {}

	public onDefinition(request:DefinitionParams, doc:TextDocument) {
		const line = doc.getText({
			start: {
				line: request.position.line,
				character: 0,
			},
			end: {
				line: request.position.line,
				character: Number.MAX_VALUE,
			},
		});

		for (const match of line.matchAll(/(['"])((?:[^\\](?<!\1)|\\['"0abfnrtv\\]|\\\d{1,3}|\\x[0-9a-fA-F]{2})*)\1/g)) {
			if (match.index &&
				match.index <= request.position.character &&
				match.index + match[0].length >= request.position.character) {
				//TODO: parse the lua escapes if any. raw values only for now...
				const name = match[2];
				const range = {
					start: {
						line: request.position.line,
						character: match.index,
					},
					end: {
						line: request.position.line,
						character: match.index + match[0].length,
					},
				};
				const defs = this.Locale.findDefinitions(name);
				return defs.map(def=>Object.assign({
					originSelectionRange: range,
				}, def));
			}
		}
		return undefined;
	}

	public onCompletion(request:CompletionParams, doc:TextDocument) {
		const line = doc.getText({
			start: {
				line: request.position.line,
				character: 0,
			},
			end: {
				line: request.position.line,
				// get a quote after the cursor if there is one...
				character: request.position.character+1,
			},
		});

		// match a string ending exactly after the cursor
		const match = line.match(/(['"])((?:[^\\](?<!\1)|\\['"0abfnrtv\\]|\\\d{1,3}|\\x[0-9a-fA-F]{2})*)\1$/);
		if (match) {
			return this.Locale.getCompletions()
				.map(key=>({
					label: key,
				}));
		}
		return undefined;
	}

}
