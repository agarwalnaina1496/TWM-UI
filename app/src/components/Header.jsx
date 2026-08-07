import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header>
      <div className="header-inner">
        <Link className="brand" to="/">Travel<em>WithMe</em></Link>
        <Link className="my-trips-link" to="/my-trips">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7" />
          </svg>
          My Trips
        </Link>
      </div>
    </header>
  );
}
