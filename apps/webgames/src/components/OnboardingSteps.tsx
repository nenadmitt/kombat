const STEPS = ['Username', 'Wallet'];

/** Where the player is in the two-step account setup. */
export function OnboardingSteps({ step }: { step: 1 | 2 }) {
  return (
    <ol className="auth-steps onboarding-steps">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={i + 1 === step ? 'auth-step is-active' : 'auth-step'}
        >
          <span className="auth-step-dot">
            {i + 1 === step ? <span className="auth-step-pip" /> : i + 1}
          </span>
          <span className="auth-step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
