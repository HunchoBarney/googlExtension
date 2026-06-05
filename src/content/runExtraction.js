(() => {
  "use strict";

  try {
    const extractor = globalThis.PMArticleExtractor;
    const ReadabilityCtor = globalThis.Readability;
    if (!extractor || !ReadabilityCtor) {
      return {
        ok: false,
        error: "The article extractor did not load."
      };
    }

    const article = extractor.extractArticleFromDocument(document, {
      Readability: ReadabilityCtor
    });

    if (!article || !article.readable) {
      return {
        ok: false,
        error: article && article.error ? article.error : "No readable article was found."
      };
    }

    return {
      ok: true,
      article
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Article extraction failed."
    };
  }
})();
