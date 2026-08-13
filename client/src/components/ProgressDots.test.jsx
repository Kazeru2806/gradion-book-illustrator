import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProgressDots from './ProgressDots.jsx';

describe('ProgressDots', () => {
  it('exposes progress in the aria label', () => {
    render(<ProgressDots completedCount={2} totalCount={5} step_state="idle" />);
    expect(screen.getByLabelText('2 of 5 steps complete')).toBeInTheDocument();
  });

  it('highlights completed segments', () => {
    const { container } = render(
      <ProgressDots completedCount={3} totalCount={5} step_state="idle" />
    );
    const segments = container.querySelectorAll('.seg');
    expect(segments).toHaveLength(5);
    expect([...segments].filter((el) => el.classList.contains('on'))).toHaveLength(3);
  });
});
