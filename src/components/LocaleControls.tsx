import React from 'react';
import { Globe, Coins } from 'lucide-react';
import { CURRENCY_META, type SupportedCurrency } from '../lib/currency';
import { LANGUAGE_META, type SupportedLanguage } from '../lib/i18n';
import { useAuth } from '../context/AuthContext';

interface LocaleControlsProps {
  compact?: boolean;
  fullWidth?: boolean;
}

export const LocaleControls: React.FC<LocaleControlsProps> = ({
  compact = false,
  fullWidth = false,
}) => {
  const {
    currency,
    setCurrency,
    language,
    setLanguage,
    availableCurrencies,
    availableLanguages,
    fxFeed,
  } = useAuth();

  return (
    <div
      className={`flex items-center gap-1.5 ${fullWidth ? 'w-full grid grid-cols-2 gap-2' : ''}`}
    >
      {/* Language Selector */}
      <label className="relative flex items-center">
        <span className="sr-only">Language</span>
        <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
        <select
          aria-label="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
          className={`h-9 pl-7 pr-6 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer ${
            fullWidth ? 'w-full' : ''
          }`}
        >
          {availableLanguages.map((code) => {
            const meta = LANGUAGE_META[code];
            return (
              <option key={code} value={code}>
                {compact ? meta.shortCode : meta.nativeName}
              </option>
            );
          })}
        </select>
      </label>

      {/* Currency Selector */}
      <label
        className="relative flex items-center"
        title={
          fxFeed.isLive
            ? `Live FX (${fxFeed.source}) · 1 INR = $${fxFeed.rates.USD.toFixed(4)} / €${fxFeed.rates.EUR.toFixed(4)}`
            : `Reference FX · 1 INR = $${fxFeed.rates.USD.toFixed(4)} / €${fxFeed.rates.EUR.toFixed(4)}`
        }
      >
        <span className="sr-only">Currency</span>
        <Coins className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
        <select
          aria-label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
          className={`h-9 pl-7 pr-6 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer tabular-nums ${
            fullWidth ? 'w-full' : ''
          }`}
        >
          {availableCurrencies.map((code) => {
            const meta = CURRENCY_META[code];
            return (
              <option key={code} value={code}>
                {compact ? meta.nativeLabel : meta.label}
              </option>
            );
          })}
        </select>
      </label>
    </div>
  );
};
