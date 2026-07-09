// ============================================================================
// TWEAKS CONFIG — surfaces the design tokens via the standard Tweaks panel
// ============================================================================

function TweaksConfig({ tweaks, setTweak }) {
  return (
    <TweaksPanel>
      <TweakSection title="Theme">
        <TweakColor
          label="Background"
          value={tweaks.bg}
          onChange={v => setTweak('bg', v)}
          options={['#f4f1ec', '#fbf9f6', '#ffffff', '#1a1a17', '#222220']}
        />
        <TweakColor
          label="Primary ink"
          value={tweaks.ink}
          onChange={v => setTweak('ink', v)}
          options={['#1a1a17', '#2a2a26', '#3d3a30', '#1e3a2e', '#23365c']}
        />
        <TweakColor
          label="Card surface"
          value={tweaks.card}
          onChange={v => setTweak('card', v)}
          options={['#ffffff', '#fbf9f6', '#f4f1ec', '#26262a', '#1f1f1d']}
        />
      </TweakSection>

      <TweakSection title="Type">
        <TweakSelect
          label="Heading font"
          value={tweaks.headingFont}
          onChange={v => setTweak('headingFont', v)}
          options={[
            { value: 'Instrument Serif', label: 'Instrument Serif' },
            { value: 'Cormorant Garamond', label: 'Cormorant Garamond' },
            { value: 'Manrope', label: 'Manrope (sans)' },
            { value: 'Geist', label: 'Geist (sans)' },
          ]}
        />
        <TweakSelect
          label="Body font"
          value={tweaks.bodyFont}
          onChange={v => setTweak('bodyFont', v)}
          options={[
            { value: 'Manrope', label: 'Manrope' },
            { value: 'Geist', label: 'Geist' },
            { value: 'Instrument Serif', label: 'Instrument Serif' },
          ]}
        />
      </TweakSection>

      <TweakSection title="Density">
        <TweakRadio
          label="Spacing"
          value={tweaks.density}
          onChange={v => setTweak('density', v)}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </TweakSection>

      <TweakSection title="Layout">
        <TweakRadio
          label="Step 2"
          value={tweaks.step2Layout}
          onChange={v => setTweak('step2Layout', v)}
          options={[
            { value: 'inline', label: 'Inline' },
            { value: 'page', label: 'New page' },
          ]}
        />
      </TweakSection>

      <TweakSection title="Copy & pricing">
        <TweakNumber
          label="Early App. price ($)"
          value={tweaks.earlyPrice}
          onChange={v => setTweak('earlyPrice', v)}
          min={0} max={999} step={10}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

window.TweaksConfig = TweaksConfig;
