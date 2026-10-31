import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Copy,
  Check,
  BookOpen,
  Plus,
  MessageSquare,
  ExternalLink,
  Languages,
  AlertCircle,
  RotateCcw,
  Loader2,
  Send,
  ArrowDown,
} from 'lucide-react';
import { sampleConversations } from '../data/tutorData';
import { aiTutorService } from '../services/aiTutorService';
import { Toast } from '../components/common/Toast';
import { CommissionBadge } from '../components/common/Badge';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';

export const AITutorPage = () => {
  const [conversations, setConversations] = useState(sampleConversations);
  const [activeConvId, setActiveConvId] = useState('conv-1');
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [languageMode, setLanguageMode] = useState('auto'); // 'auto' | 'english' | 'roman_urdu'
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [lastFailedQuery, setLastFailedQuery] = useState(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const msgCounterRef = useRef(100);

  const activeConversation = conversations.find((c) => c.id === activeConvId) || conversations[0];

  const suggestedPrompts = [
    'What is the difference between RAM and ROM?',
    'Explain the OSI model in simple English.',
    'Give me five medium-level DBMS MCQs with answers and explanations.',
    'What is the latest FPSC advertisement and its closing date?',
    'Explain Article 2A in Roman Urdu',
    'What is the syllabus for Inspector Customs (BS-16)?',
  ];

  // Detect user scrolling in the conversation container
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distanceFromBottom < 80;
    isNearBottomRef.current = isNearBottom;
    setUserHasScrolledUp(!isNearBottom);
  }, []);

  // Smooth scroll to bottom: forced on new user send, conditional on background updates
  const scrollToBottom = useCallback((force = false) => {
    if (force || isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUserHasScrolledUp(false);
      isNearBottomRef.current = true;
    }
  }, []);

  // When messages update or loading state changes, scroll only if user was already at the bottom
  useEffect(() => {
    scrollToBottom(false);
  }, [activeConversation?.messages, isTyping, scrollToBottom]);

  // Dynamically auto-grow the textarea as text expands, up to 160px max height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      const newHeight = Math.min(Math.max(scrollH, 56), 160);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  const handleStartNewChat = () => {
    msgCounterRef.current += 1;
    const newId = `conv-${msgCounterRef.current}`;
    const newConv = {
      id: newId,
      title: 'New FPSC Study Consultation',
      timestamp: 'Just now',
      messages: [
        {
          id: `msg-${msgCounterRef.current}`,
          sender: 'assistant',
          text: `Welcome! I am your ExamSathi Academic Study Buddy, grounded in official Federal Public Service Commission (FPSC) documentation, syllabus schemes, and examination acts. You can ask about General Recruitment eligibility, CSS/MPT patterns, past-paper reasoning, or request explanations in English or Roman Urdu.`,
          sources: [
            {
              title: 'Federal Public Service Commission Official Examination Guidelines',
              officialSourceUrl: 'https://www.fpsc.gov.pk',
              verificationStatus: 'Verified Official FPSC Portal',
            },
          ],
        },
      ],
    };
    setConversations([newConv, ...conversations]);
    setActiveConvId(newId);
    setToastMsg('Started new conversation.');
    setTimeout(() => scrollToBottom(true), 50);
  };

  const handleSendMessage = async (textToSend) => {
    if (isTyping) return; // Prevent duplicate submissions

    const query = (textToSend || inputValue).trim();
    if (!query) return;

    const isManualInput = !textToSend;
    if (isManualInput) {
      setInputValue('');
    }

    msgCounterRef.current += 1;
    const userMsgId = `user-${msgCounterRef.current}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text: query,
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConvId) {
          return {
            ...c,
            title:
              c.title === 'New FPSC Study Consultation' || c.title === 'New Study Conversation'
                ? query.slice(0, 36) + '...'
                : c.title,
            messages: [...c.messages, userMsg],
          };
        }
        return c;
      })
    );

    setIsTyping(true);

    // Immediately scroll user to see their sent message
    setTimeout(() => scrollToBottom(true), 20);

    try {
      const history = (activeConversation?.messages || [])
        .filter((m) => !m.isError)
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          text: m.text,
        }));

      const tutorResponse = await aiTutorService.askTutor({
        query,
        conversationHistory: history,
        language: languageMode,
      });

      msgCounterRef.current += 1;
      const assistantMsg = {
        id: `asst-${msgCounterRef.current}`,
        sender: 'assistant',
        text: tutorResponse.answer,
        sources: tutorResponse.sources || [],
        provider: tutorResponse.provider,
        retrievalTimestamp: tutorResponse.retrievalTimestamp,
      };

      setLastFailedQuery(null);
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConvId) {
            return {
              ...c,
              messages: [...c.messages, assistantMsg],
            };
          }
          return c;
        })
      );
    } catch (err) {
      msgCounterRef.current += 1;
      setLastFailedQuery(query);
      if (isManualInput) {
        setInputValue(query); // Preserve text on failure so user can edit or retry
      }
      const errorMsg = {
        id: `asst-err-${msgCounterRef.current}`,
        sender: 'assistant',
        isError: true,
        failedQuery: query,
        text: err.message || 'The AI Study Buddy encountered an error contacting the examination knowledge engine.',
        sources: [],
      };
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConvId) {
            return { ...c, messages: [...c.messages, errorMsg] };
          }
          return c;
        })
      );
      setToastMsg('Error generating response. Your message was preserved so you can retry.');
    } finally {
      setIsTyping(false);
    }
  };

  const handleCopyText = (id, text) => {
    navigator.clipboard?.writeText(text);
    setCopiedMsgId(id);
    setToastMsg('Copied response to clipboard.');
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Toast message={toastMsg} onClose={() => setToastMsg('')} />

      {/* Main Chat Layout Container with constrained height and proper flex columns */}
      <div className="bg-white rounded-md border border-[#E2E8F0] grid grid-cols-1 md:grid-cols-4 h-[700px] lg:h-[750px] max-h-[calc(100vh-6rem)] min-h-[520px] overflow-hidden shadow-xs">
        {/* Left Column: Conversations Sidebar */}
        <div className="hidden md:flex flex-col border-r border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-3 min-h-0 min-w-0">
          <button
            type="button"
            onClick={handleStartNewChat}
            className="w-full py-2 px-3 rounded-md bg-[#15233B] hover:bg-slate-900 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Consultation</span>
          </button>

          <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
            <span className="text-[11px] font-semibold text-[#64748B] px-2 block mb-1">
              Recent Consultations
            </span>
            {conversations.map((c) => {
              const isSelected = c.id === activeConvId;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setActiveConvId(c.id);
                    setTimeout(() => scrollToBottom(true), 50);
                  }}
                  className={`w-full p-2.5 rounded-md text-left text-xs transition-colors flex items-start gap-2 ${
                    isSelected
                      ? 'bg-white text-[#3156A6] font-semibold border border-[#E2E8F0]'
                      : 'text-slate-700 hover:bg-slate-200/50'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{c.title}</p>
                    <span className="text-[10px] text-slate-400">{c.timestamp}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Chat Workspace */}
        <div className="md:col-span-3 flex flex-col h-full bg-white min-h-0 min-w-0 relative">
          {/* Chat Header */}
          <div className="p-3.5 border-b border-[#E2E8F0] flex items-center justify-between shrink-0 bg-white">
            <div className="space-y-0.5 min-w-0 flex-1 mr-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#15233B] truncate">
                  AI Academic Study Buddy
                </h2>
                <CommissionBadge commission="FPSC" showComingSoon={false} />
              </div>
              <p className="text-[11px] text-[#64748B] truncate">
                Evidence-based answers grounded in official Pakistani competitive examination syllabi
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Language Selector */}
              <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded border border-[#E2E8F0] text-[11px]">
                <Languages className="w-3 h-3 text-slate-500 ml-1" />
                <button
                  type="button"
                  onClick={() => setLanguageMode('auto')}
                  className={`px-1.5 py-0.5 rounded transition-all ${
                    languageMode === 'auto' ? 'bg-white font-bold text-[#3156A6] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setLanguageMode('english')}
                  className={`px-1.5 py-0.5 rounded transition-all ${
                    languageMode === 'english' ? 'bg-white font-bold text-[#3156A6] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLanguageMode('roman_urdu')}
                  className={`px-1.5 py-0.5 rounded transition-all ${
                    languageMode === 'roman_urdu' ? 'bg-white font-bold text-[#3156A6] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Roman Urdu
                </button>
              </div>

              <button
                type="button"
                onClick={handleStartNewChat}
                className="md:hidden p-1.5 rounded border border-[#E2E8F0] text-xs hover:bg-slate-100"
                aria-label="New chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Stream Container - Scrollable Area */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 p-4 sm:p-5 overflow-y-auto space-y-4 focus:outline-none"
            tabIndex={0}
            role="log"
            aria-label="Conversation messages"
          >
            {activeConversation?.messages.map((msg) => {
              const isAssistant = msg.sender === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`rounded-md p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed space-y-3 break-words ${
                      isAssistant
                        ? 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#172033] w-full max-w-[95%] sm:max-w-2xl'
                        : 'bg-[#15233B] text-white max-w-[85%] sm:max-w-xl'
                    }`}
                  >
                    {isAssistant && msg.isError ? (
                      <div className="flex items-start gap-2.5 p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-900">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <p className="font-semibold text-xs">Request Encountered an Error</p>
                          <p className="text-xs text-rose-700 leading-relaxed">{msg.text}</p>
                          <button
                            type="button"
                            onClick={() => handleSendMessage(msg.failedQuery || lastFailedQuery)}
                            className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium text-xs transition-colors shadow-xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Retry Question</span>
                          </button>
                        </div>
                      </div>
                    ) : isAssistant ? (
                      <MarkdownRenderer content={msg.text} />
                    ) : (
                      <div className="whitespace-pre-wrap font-sans">
                        {msg.text}
                      </div>
                    )}

                    {/* Official Citations */}
                    {isAssistant && !msg.isError && msg.sources && msg.sources.length > 0 && (
                      <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1">
                          <BookOpen className="w-3 h-3 text-[#3156A6]" />
                          Verified Source & Curriculum References:
                        </span>
                        <div className="space-y-1.5">
                          {msg.sources.map((src, sIdx) => {
                            const isOfficialDoc =
                              src.verificationStatus?.includes('Official') ||
                              src.officialSourceUrl?.includes('fpsc.gov.pk');
                            const isPracticeScheme = src.verificationStatus?.includes('Practice');

                            return (
                              <div
                                key={sIdx}
                                className="p-2.5 rounded bg-white border border-[#E2E8F0] text-[11px] space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-[#15233B] truncate">
                                    {src.title}
                                  </p>
                                  {src.officialSourceUrl && (
                                    <a
                                      href={src.officialSourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#3156A6] hover:text-blue-800 flex items-center gap-0.5 shrink-0 font-medium"
                                      title="Open official document"
                                    >
                                      <span>Official Link</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                  {isOfficialDoc ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                      • Verified Official FPSC Document
                                    </span>
                                  ) : isPracticeScheme ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                                      • Verified Academic Practice Scheme
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200">
                                      • Academic Curriculum Concept
                                    </span>
                                  )}
                                  {src.retrievalTimestamp && (
                                    <span className="text-slate-400">
                                      Retrieved: {new Date(src.retrievalTimestamp).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Message Footer */}
                    {isAssistant && !msg.isError && (
                      <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#64748B]">
                        <span className="truncate max-w-[250px]">
                          {msg.provider || 'ExamSathi Source-Aware Engine'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.id, msg.text)}
                          className="hover:text-slate-900 flex items-center gap-1 shrink-0 transition-colors"
                        >
                          {copiedMsgId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center gap-2.5 p-3 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#3156A6]">
                <Loader2 className="w-4 h-4 animate-spin text-[#3156A6]" />
                <span className="font-medium">ExamSathi AI is retrieving curriculum evidence and formulating your answer...</span>
              </div>
            )}
            <div ref={messagesEndRef} className="h-1" />
          </div>

          {/* Floating Scroll-to-latest button when user has intentionally scrolled up */}
          {userHasScrolledUp && (
            <div className="absolute bottom-28 right-6 z-20">
              <button
                type="button"
                onClick={() => scrollToBottom(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#15233B] hover:bg-slate-900 text-white text-xs font-medium shadow-md transition-all hover:scale-105 border border-slate-700"
                aria-label="Scroll to latest message"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Scroll to latest</span>
              </button>
            </div>
          )}

          {/* Suggested Prompts */}
          <div className="px-4 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC] shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
              <span className="text-[#64748B] font-semibold shrink-0">Prompts:</span>
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="px-2.5 py-1 rounded bg-white border border-[#E2E8F0] hover:border-[#3156A6] text-slate-700 shrink-0 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Input Bar - Always visible at bottom, cannot be pushed off-screen */}
          <div className="p-3.5 sm:p-4 border-t border-[#E2E8F0] bg-white shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex flex-col gap-1.5"
            >
              <div className="flex items-end gap-2.5 sm:gap-3">
                <div className="flex-1 relative rounded-md border border-[#CBD5E1] bg-white focus-within:border-[#3156A6] focus-within:ring-1 focus-within:ring-[#3156A6] transition-all">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={2}
                    placeholder="Ask a question about your exam preparation..."
                    disabled={isTyping}
                    className="w-full px-3.5 py-3 text-sm text-[#172033] placeholder-slate-400 bg-transparent resize-none leading-relaxed focus:outline-none overflow-y-auto"
                    style={{ minHeight: '56px', maxHeight: '160px' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="px-4 sm:px-5 py-2.5 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-semibold text-xs sm:text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 h-[56px] shadow-xs cursor-pointer disabled:cursor-not-allowed"
                  title="Send question (Enter)"
                >
                  {isTyping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="hidden sm:inline">Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
                <span>Press Enter to send, Shift + Enter for new line</span>
                {inputValue.length > 0 && (
                  <span className="text-slate-400">{inputValue.length} characters</span>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
