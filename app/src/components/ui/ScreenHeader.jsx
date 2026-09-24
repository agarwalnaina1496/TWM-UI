export default function ScreenHeader({ eyebrow, title, lede }) {
  return (
    <>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
    </>
  );
}
