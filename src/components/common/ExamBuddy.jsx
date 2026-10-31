import React, { useState } from 'react';
import {
  Sparkles,
  Flame,
  Award,
  ShieldCheck,
  AlertCircle,
  Volume2,
  VolumeX,
  Settings2,
  Zap,
} from 'lucide-react';
import { studentProgressService } from '../../services/studentProgressService';
import { MASCOT_MODES } from '../../utils/examBuddyReactions';

export const ExamBuddy = ({
  reaction,
  onModeChange,
  compact = false,
  title = 'ExamBuddy Study Companion',
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState(() => studentProgressService.getMascotPreferences());

  const handleUpdateMode = (newMode) => {
    const updated = studentProgressService.saveMascotPreferences({ mode: newMode });
    setPrefs(updated);
    if (onModeChange) onModeChange(newMode);
  };

  const handleToggleSound = () => {
    const updated = studentProgressService.saveMascotPreferences({ soundEnabled: !prefs.soundEnabled });
    setPrefs(updated);
  };

  const handleToggleAnimations = () => {
    const updated = studentProgressService.saveMascotPreferences({ animationsEnabled: !prefs.animationsEnabled });
    setPrefs(updated);
  };

  // Select appropriate Lucide icon and border styling based on reaction tone
  const getToneAttributes = (tone) => {
    switch (tone) {
      case 'perfection':
        return {
          icon: Award,
          borderColor: 'border-amber-400',
          bgColor: 'bg-amber-50/50',
          badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
          iconColor: 'text-amber-600',
        };
      case 'celebratory':
        return {
          icon: Sparkles,
          borderColor: 'border-emerald-300',
          bgColor: 'bg-emerald-50/40',
          badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          iconColor: 'text-emerald-600',
        };
      case 'positive':
        return {
          icon: Flame,
          borderColor: 'border-blue-300',
          bgColor: 'bg-blue-50/40',
          badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
          iconColor: 'text-blue-600',
        };
      case 'encouraging':
        return {
          icon: ShieldCheck,
          borderColor: 'border-slate-300',
          bgColor: 'bg-[#F8FAFC]',
          badgeColor: 'bg-slate-200 text-slate-800 border-slate-300',
          iconColor: 'text-[#3156A6]',
        };
      case 'supportive':
      default:
        return {
          icon: AlertCircle,
          borderColor: 'border-slate-300',
          bgColor: 'bg-[#F8FAFC]',
          badgeColor: 'bg-slate-200 text-slate-800 border-slate-300',
          iconColor: 'text-slate-600',
        };
    }
  };

  if (!reaction) return null;

  const toneAttr = getToneAttributes(reaction.tone);
  const ToneIcon = toneAttr.icon;

  return (
    <div
      className={`rounded-md border ${toneAttr.borderColor} ${toneAttr.bgColor} ${
        compact ? 'p-3' : 'p-4 sm:p-5'
      } relative transition-all ${
        prefs.animationsEnabled ? 'duration-200' : ''
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Mascot Avatar & Reaction Text */}
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-md bg-white border border-[#E2E8F0] flex items-center justify-center shrink-0 shadow-xs ${toneAttr.iconColor}`}
          >
            <ToneIcon className="w-5 h-5" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-xs text-[#15233B] tracking-tight">
                {title}
              </span>
              {reaction.badge && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${toneAttr.badgeColor}`}
                >
                  {reaction.badge}
                </span>
              )}
              <span className="text-[10px] text-slate-500 font-medium capitalize">
                ({prefs.mode.replace('_', ' ')})
              </span>
            </div>

            <p className="text-xs sm:text-sm text-[#172033] font-medium leading-relaxed">
              "{reaction.message}"
            </p>
          </div>
        </div>

        {/* Mascot Mode and Animation Controls */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
          <button
            type="button"
            onClick={handleToggleSound}
            className="p-1.5 rounded border border-[#E2E8F0] bg-white text-slate-500 hover:text-slate-900 text-xs transition-colors"
            title={prefs.soundEnabled ? 'Mute sound (Currently ON)' : 'Enable sound (Currently OFF)'}
            aria-label="Toggle mascot sound"
          >
            {prefs.soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#3156A6]" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded border border-[#E2E8F0] bg-white text-slate-600 hover:text-slate-900 text-xs transition-colors flex items-center gap-1"
            title="Mascot Personality Settings"
            aria-label="ExamBuddy Settings"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Settings Dropdown Drawer */}
      {showSettings && (
        <div className="mt-3 pt-3 border-t border-[#E2E8F0] bg-white rounded p-3 text-xs space-y-3 shadow-xs">
          <div>
            <label className="block text-[11px] font-bold text-[#15233B] uppercase tracking-wider mb-1.5">
              Humor & Reaction Tone:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MASCOT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleUpdateMode(m.id)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors border ${
                    prefs.mode === m.id
                      ? 'bg-[#15233B] text-white border-[#15233B] font-semibold'
                      : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#3156A6]" />
              <span>UI Micro-Animations:</span>
            </div>
            <button
              type="button"
              onClick={handleToggleAnimations}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                prefs.animationsEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {prefs.animationsEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
