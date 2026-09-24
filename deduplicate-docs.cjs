const { resolvePrompt } = require('./stage-prompts.cjs');
function duplicatePrompt(name, text, instructionsText) {
  return [
    instructionsText || resolvePrompt('stage2'),
    'Filename: '+name,
    'Document content:\n'+text,
    'End of document. Return the COMPLETE deduplicated Markdown document only. Preserve all unique content. Do not summarize, return JSON, or wrap the document in an outer code fence.'
  ].join('\n\n');
}
function applyDuplicates(text, content, finishReason) {
  if (['length', 'max_tokens', 'max_output_tokens'].includes(finishReason)) throw new Error('Stage 2 response was truncated; original document preserved');
  if (typeof content !== 'string' || !content.trim()) throw new Error('Stage 2 model returned no document content');
  try {
    const value = JSON.parse(content);
    if (value && typeof value === 'object') throw new Error('Stage 2 returned JSON instead of the deduplicated document');
  } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  return {text:content,changed:content !== text};
}
module.exports={duplicatePrompt,applyDuplicates};
