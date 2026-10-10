'use strict';

function assistantText(body) {
  function text(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join('\n');
    if (!value || typeof value !== 'object') return '';
    if (value.type && !['message', 'text', 'output_text'].includes(value.type)) return '';
    if (value.role && value.role !== 'assistant') return '';
    return text(value.content ?? value.text);
  }
  return text(body.output_text ?? body.output ?? body.choices?.[0]?.message?.content ?? body.response);
}
module.exports = {assistantText};
