import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Stepper from './Stepper.jsx';

function project(overrides) {
  return {
    status: 'CREATED',
    step_state: 'idle',
    ...overrides,
  };
}

describe('Stepper', () => {
  it('marks completed steps through the current status', () => {
    render(<Stepper project={project({ status: 'STYLE_SET' })} />);

    expect(screen.getByLabelText('Style complete')).toBeInTheDocument();
    expect(screen.getByText('Characters')).toBeInTheDocument();
    expect(screen.queryByLabelText('Characters complete')).not.toBeInTheDocument();
  });

  it('shows running state on the active step', () => {
    const { container } = render(
      <Stepper
        project={project({
          status: 'STYLE_SET',
          step_state: 'running',
        })}
      />
    );

    const current = container.querySelector('.step.current');
    expect(current).toBeTruthy();
    expect(current?.querySelector('.lbl')?.textContent).toBe('Characters');
    expect(current?.querySelector('.spinner')).toBeTruthy();
  });

  it('shows failed state on the active step', () => {
    const { container } = render(
      <Stepper
        project={project({
          status: 'CHARACTERS_GENERATED',
          step_state: 'failed',
        })}
      />
    );

    const current = container.querySelector('.step.current');
    expect(current).toBeTruthy();
    expect(current?.querySelector('.lbl')?.textContent).toBe('Portraits');
    expect(current?.querySelector('.gd-num-square')?.textContent).toBe('!');
  });
});
