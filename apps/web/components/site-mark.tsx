export function SiteMark({size=32}:{size?:number}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" className="shrink-0"><rect width="64" height="64" rx="15" fill="#126f82"/><path d="M14 16h15c3 0 5 2 5 5v28c-2-3-4-5-8-5H14V16Z" fill="#fff"/><path d="M38 16h12v28H38c-3 0-5 2-7 5V22c0-3 3-6 7-6Z" fill="#d7edf0"/><path d="M20 24h8M20 30h8M20 36h6M39 24h5M39 30h5" fill="none" stroke="#126f82" strokeWidth="2.5" strokeLinecap="round"/><path d="M32 23v25" stroke="#126f82" strokeWidth="2.5"/></svg>;
}
