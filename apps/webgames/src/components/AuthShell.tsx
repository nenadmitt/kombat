import { Lock } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { BrandLockup } from './BrandMark';
import { CHAIN_NAME } from '../lib/chain';

const STEPS = ['Sign in', 'Wallet', 'Stake'];

type Props = {
  /** Headline, one line per array entry, set tight. */
  title: string[];
  lead: string;
  points: { icon: Icon; label: string }[];
  /** The step the player is on, 1-based. */
  step?: number;
  children: ReactNode;
};

/**
 * The signed-out shell: pitch on the left, the actual form on the right. On a
 * phone the left column is the part that gives way - only the wordmark and
 * the headline stay.
 */
export function AuthShell({ title, lead, points, step = 1, children }: Props) {
  return (
    <div className="auth">
      <div className="auth-panel">
        <aside className="auth-pitch">
          <div className="auth-brand">
            <BrandLockup size={22} />
          </div>

          <div className="auth-pitch-body">
            <ol className="auth-steps">
              {STEPS.map((label, i) => (
                <li
                  key={label}
                  className={i + 1 === step ? 'auth-step is-active' : 'auth-step'}
                >
                  <span className="auth-step-dot">
                    {i + 1 === step ? <span className="auth-step-pip" /> : i + 1}
                  </span>
                  {label}
                </li>
              ))}
            </ol>

            <h1 className="auth-title">
              {title.map(line => (
                <span key={line}>{line}</span>
              ))}
            </h1>

            <p className="auth-lead">{lead}</p>

            <ul className="auth-points">
              {points.map(({ icon: Glyph, label }) => (
                <li key={label}>
                  <Glyph size={17} color="var(--lime)" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <p className="auth-footnote">
            <Lock size={13} />
            Test mode on Ethereum {CHAIN_NAME} - no real funds at risk.
          </p>
        </aside>

        <section className="auth-form">{children}</section>
      </div>
    </div>
  );
}
