import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';
import { normalizeMarkdown, isSafeUrl } from '../../utils/markdownUtils';

/**
 * Robust Markdown Renderer for ExamSathi AI Chatbot
 * Renders headings, lists, bold text, code blocks, links, and horizontally scrollable tables
 * with GitHub-Flavored Markdown (GFM) support and security sanitization.
 */
export const MarkdownRenderer = ({ content, className = '' }) => {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const normalized = normalizeMarkdown(content);

  return (
    <div className={`markdown-body text-xs sm:text-sm leading-relaxed break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-sm sm:text-base font-bold text-[#15233B] mt-3 mb-1.5 first:mt-0 pb-1 border-b border-slate-200">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs sm:text-sm font-bold text-[#15233B] mt-2.5 mb-1 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs sm:text-sm font-semibold text-[#15233B] mt-2 mb-1 first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 leading-relaxed text-[#172033]">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-4 mb-2.5 space-y-1 text-[#172033]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-4 mb-2.5 space-y-1 text-[#172033]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[#15233B]">
              {children}
            </strong>
          ),
          a: ({ href, children }) => {
            const safe = isSafeUrl(href);
            if (!safe) {
              return <span className="font-medium text-slate-700">{children}</span>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3156A6] hover:text-blue-800 underline font-medium inline-flex items-center gap-0.5 break-all"
              >
                <span>{children}</span>
                <ExternalLink className="w-3 h-3 inline shrink-0 ml-0.5" />
              </a>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-md border border-[#E2E8F0] shadow-2xs max-w-full">
              <table className="min-w-full divide-y divide-[#E2E8F0] text-xs text-left bg-white">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#F8FAFC] text-[#15233B] font-semibold">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 border-b border-[#E2E8F0] font-semibold text-[#15233B] whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-slate-100 text-[#334155] align-top">
              {children}
            </td>
          ),
          tr: ({ children }) => (
            <tr className="even:bg-slate-50/50 hover:bg-slate-50 transition-colors">
              {children}
            </tr>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isCodeBlock = codeClassName?.includes('language-') || String(children).includes('\n');
            if (isCodeBlock) {
              return (
                <div className="overflow-x-auto my-2.5 rounded-md bg-[#0F172A] p-3 text-slate-100 font-mono text-xs max-w-full">
                  <pre className="m-0 p-0 overflow-x-auto">
                    <code {...props}>{children}</code>
                  </pre>
                </div>
              );
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-800 font-mono text-[11px] break-words"
                {...props}
              >
                {children}
              </code>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-[#3156A6] pl-3 py-1 my-2 bg-blue-50/40 text-xs text-slate-700 italic rounded-r">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-t border-[#E2E8F0]" />,
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
};
