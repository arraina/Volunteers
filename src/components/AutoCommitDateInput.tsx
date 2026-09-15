import React from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> & {
  type: 'date' | 'datetime-local' | 'time';
  onValueChange: (value: string) => void;
};

/** Native date/time input that commits and closes as soon as a complete value is selected. */
const AutoCommitDateInput: React.FC<Props> = ({ onValueChange, ...props }) => (
  <input
    {...props}
    onChange={(event) => {
      const input = event.currentTarget;
      onValueChange(input.value);
      if (input.value) window.requestAnimationFrame(() => input.blur());
    }}
  />
);

export default AutoCommitDateInput;
