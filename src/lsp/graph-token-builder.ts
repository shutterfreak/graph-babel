import { TokenType, TokenVocabulary } from 'chevrotain';
import {
  DefaultTokenBuilder,
  Grammar,
  GrammarAST,
  GrammarUtils,
  TokenBuilder,
  TokenBuilderOptions,
  isTokenTypeArray,
} from 'langium';

/**
 * GraphTokenBuilder extends the DefaultTokenBuilder to customize token creation for the Graph language.
 * It overrides the buildTokens and buildTerminalToken methods to modify the default tokenization behavior.
 */
export class GraphTokenBuilder extends DefaultTokenBuilder implements TokenBuilder {
  /**
   * Overrides the default buildTokens method to create a token vocabulary for the Graph grammar.
   * Ensures that the token types are correctly built and throws an error if the default builder fails.
   *
   * @param grammar The grammar for which to build the token vocabulary.
   * @param options Optional configuration for token building.
   * @returns The token vocabulary for the grammar.
   * @throws Error if the default token builder returns an invalid token array.
   */
  override buildTokens(grammar: Grammar, options?: TokenBuilderOptions): TokenVocabulary {
    const tokenTypes = super.buildTokens(grammar, options);

    if (!isTokenTypeArray(tokenTypes)) {
      throw new Error('Invalid tokens built by default token builder');
    }

    return tokenTypes;
  }

  /**
   * Overrides the default buildTerminalToken method to customize the creation of terminal tokens.
   * Specifically, it ensures that whitespace tokens (WS) are marked as 'hidden' instead of being skipped.
   * This allows whitespace tokens to be included in the Concrete Syntax Tree (CST).
   *
   * @param terminal The terminal rule for which to build the token.
   * @returns The token type for the terminal rule.
   */
  protected override buildTerminalToken(terminal: GrammarAST.TerminalRule): TokenType {
    const regex = GrammarUtils.terminalRegex(terminal);
    const pattern = this.requiresCustomPattern(regex) ? this.regexPatternFunction(regex) : regex;
    const tokenType: TokenType = {
      name: terminal.name,
      PATTERN: pattern,
      LINE_BREAKS: typeof pattern === 'function' ? true : undefined,
      // Override from DefaultTokenBuilder: mark WS as hidden instead of skipping
      GROUP: terminal.hidden ? 'hidden' : undefined,
    };
    return tokenType;
  }
}
