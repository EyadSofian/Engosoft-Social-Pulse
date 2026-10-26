import type { HTMLAttributes, ReactNode } from 'react';

/** A quiet surface: white, a hairline border, no lift. */
export function Card({ className, flush, children, ...rest }: { flush?: boolean } & HTMLAttributes<HTMLElement>) {
  return (
    <section className={`ui-card${flush ? ' ui-card--flush' : ''}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </section>
  );
}

/** Card title row: heading, optional count and description, actions at the end. */
export function CardHeader({ title, count, description, icon, actions, as: Heading = 'h2' }: { title: ReactNode; count?: number | string; description?: ReactNode; icon?: ReactNode; actions?: ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <header className="ui-card__head">
      <div className="ui-card__titles">
        <Heading className="ui-card__title">
          {icon && <span className="ui-card__icon">{icon}</span>}
          <span>{title}</span>
          {count != null && <span className="ui-card__count u-tnum">{count}</span>}
        </Heading>
        {description && <p className="ui-card__desc">{description}</p>}
      </div>
      {actions && <div className="ui-card__actions">{actions}</div>}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ui-card__body${className ? ` ${className}` : ''}`}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <footer className="ui-card__foot">{children}</footer>;
}

/** A titled region on a page without a surface of its own. */
export function Section({ title, description, actions, children, id }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="ui-section" id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <header className="ui-section__head">
        <div>
          <h2 className="ui-section__title" id={id ? `${id}-title` : undefined}>
            {title}
          </h2>
          {description && <p className="ui-section__desc">{description}</p>}
        </div>
        {actions && <div className="ui-section__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Label / value pairs in a two-column grid. */
export function DefinitionList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="ui-deflist">
      {items.map((item, index) => (
        <div key={index} className="ui-deflist__row">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
