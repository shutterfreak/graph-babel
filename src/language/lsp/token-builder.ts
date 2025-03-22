import { TokenType, TokenVocabulary } from 'chevrotain';
import {
  DefaultTokenBuilder,
  Grammar,
  GrammarAST,
  GrammarUtils,
  TokenBuilder,
  TokenBuilderOptions,
  isTokenTypeArray,
  stream,
} from 'langium';
import { inspect } from 'util';

import { render_text } from '../model-helpers.js';

/**
 * GraphTokenBuilder extends the DefaultTokenBuilder to customize token creation for the Graph language.
 * It overrides the buildTokens and buildTerminalToken methods to modify the default tokenization behavior,
 * particularly in how hidden tokens are handled.
 */
export class GraphTokenBuilder extends DefaultTokenBuilder implements TokenBuilder {
  /**
   * Overrides the default buildTokens method to create a token vocabulary for the Graph grammar.
   * This method ensures that keyword tokens are prioritized over terminal tokens and
   * that terminal tokens with regex patterns are prioritized over other terminal tokens.
   * It also handles the creation of a valid token vocabulary, throwing an error if the process fails.
   *
   * @param grammar The grammar for which to build the token vocabulary.
   * @param options Optional configuration for token building.
   * @returns The token vocabulary for the grammar.
   * @throws Error if the default token builder returns an invalid token array.
   */
  override buildTokens(grammar: Grammar, options?: TokenBuilderOptions): TokenVocabulary {
    const reachableRules = stream(GrammarUtils.getAllReachableRules(grammar, false));
    const terminalTokens: TokenType[] = this.buildTerminalTokens(reachableRules);
    if (!isTokenTypeArray(terminalTokens)) {
      throw new Error('Invalid tokens built by default token builder');
    }
    const keywordTokens: TokenType[] = this.buildKeywordTokens(
      reachableRules,
      terminalTokens,
      options,
    );

    // Ensure keyword tokens are added before terminal tokens
    const tokens: TokenType[] = [];
    keywordTokens.forEach((token) => {
      console.log(
        `buildTokens() - pushing keyword token to tokens:\n${render_text(inspect(token), 'Keyword token')}`,
      );
      tokens.push(token);
    });

    // Add terminal tokens with regex patterns first
    terminalTokens.forEach((terminalToken) => {
      const pattern = terminalToken.PATTERN;
      if (typeof pattern === 'object' && 'test' in pattern) {
        console.log(
          `buildTokens() - pushing token with 'test' property in pattern to tokens:\n${render_text(inspect(terminalToken), `Terminal 'test' token`)}`,
        );
        tokens.push(terminalToken);
      }
    });

    // Add remaining terminal tokens
    terminalTokens.forEach((terminalToken) => {
      const pattern = terminalToken.PATTERN;
      if (!(typeof pattern === 'object' && 'test' in pattern)) {
        console.log(
          `buildTokens() - pushing token with 'test' property in pattern to tokens:\n${render_text(inspect(terminalToken), `Other Terminal token`)}`,
        );
        tokens.push(terminalToken);
      }
    });

    // We don't need to add the EOF token explicitly.
    // It is automatically available at the end of the token stream.
    return tokens;
  }

  /**
   * Overrides the buildTerminalToken method to customize the creation of individual terminal tokens.
   * This method sets the 'GROUP' property of hidden tokens to 'hidden'.
   * It also adds debug logging for each terminal token created.
   *
   * @param terminal The terminal rule for which to create a token.
   * @returns The created TokenType.
   */
  protected override buildTerminalToken(terminal: GrammarAST.TerminalRule): TokenType {
    console.log(
      `buildTerminalToken() - token ${terminal.name}${terminal.hidden ? ' [HIDDEN]' : ''}:\n${render_text(
        inspect(terminal),
        `${terminal.name}${terminal.hidden ? ' [HIDDEN]' : ''}`,
      )}`,
    );
    const regex = GrammarUtils.terminalRegex(terminal);
    const pattern = this.requiresCustomPattern(regex) ? this.regexPatternFunction(regex) : regex;
    const tokenType: TokenType = {
      name: terminal.name,
      PATTERN: pattern,
    };
    if (typeof pattern === 'function') {
      tokenType.LINE_BREAKS = true;
    }

    if (terminal.hidden) {
      tokenType.GROUP = 'hidden';
      console.log(
        `buildTerminalToken() - token ${terminal.name} [HIDDEN]: setting GROUP to "${tokenType.GROUP}"`,
      );
    }

    console.log(
      `buildTerminalToken() - token ${terminal.name}${terminal.hidden ? ' [HIDDEN]' : ''}:\n${inspect(tokenType)}`,
    );
    return tokenType;
  }
}
