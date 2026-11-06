import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
type Shape = (props: IconProps) => React.ReactNode;

function icon(shape: React.ReactNode): Shape {
  return function ReadingIcon({ size = 20, children, ...props }: IconProps) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shape}{children}</svg>;
  };
}

// One code-native icon vocabulary for the reading station.
export const ArrowRight = icon(<path d="M4 12h15m-6-6 6 6-6 6" />);
export const ArrowLeft = icon(<path d="M20 12H5m6-6-6 6 6 6" />);
export const ArrowUpRight = icon(<path d="M6 18 18 6M7 6h11v11" />);
export const ExternalLink = icon(<><path d="M13 4h7v7m-9 2 9-9M9 5H5v15h15v-5" /></>);
export const Plus = icon(<path d="M5 12h14M12 5v14" />);
export const X = icon(<path d="m6 6 12 12M18 6 6 18" />);
export const MoreHorizontal = icon(<><circle cx={5} cy={12} r={1}/><circle cx={12} cy={12} r={1}/><circle cx={19} cy={12} r={1}/></>);
export const PanelLeft = icon(<><rect x={3} y={4} width={18} height={16} rx={2}/><path d="M9 4v16"/></>);
export const PanelRight = icon(<><rect x={3} y={4} width={18} height={16} rx={2}/><path d="M15 4v16"/></>);
export const PanelsTopLeft = icon(<><rect x={7} y={8} width={14} height={12} rx={2}/><path d="M4 15H3V4h14v1"/></>);
export const Maximize = icon(<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>);
export const Minimize = icon(<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5"/>);
export const Check = icon(<path d="m5 12 4.5 4.5L19 7" />);
export const Copy = icon(<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>);
export const FileText = icon(<><path d="M5 3h10l4 4v14H5zM15 3v5h4M9 12h6m-6 4h6" /></>);
export const NotebookPen = icon(<><path d="M14 4H6v16h12v-7M3 8h5m-5 8h5m4-6 6-6 3 3-6 6-4 1z" /></>);
export const PenLine = icon(<><path d="m5 16 11-11 3 3L8 19H5zM14 7l3 3M4 22h16" /></>);
export const Search = icon(<><circle cx={10.5} cy={10.5} r={6.5}/><path d="m16 16 5 5"/></>);
export const Pencil = PenLine;
export const Trash2 = icon(<><path d="M4 6h16M9 3h6M6 6l1 15h10l1-15M10 10v7m4-7v7" /></>);
export const Clock3 = icon(<><circle cx={12} cy={12} r={8.5} /><path d="M12 6v6h5" /></>);
export const CalendarDays = icon(<><rect x={3} y={5} width={18} height={16} rx={2}/><path d="M7 3v4m10-4v4M3 10h18m-13 4h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></>);
export const History = icon(<><path d="M4 9a8 8 0 1 1 .5 7M4 4v5h5M12 7v5l4 2" /></>);
export const Play = icon(<path d="m8 5 11 7-11 7z" />);
export const PlayCircle = icon(<><circle cx={12} cy={12} r={9} /><path d="m10 8 6 4-6 4z" /></>);
export const Send = icon(<path d="m3 10 18-7-7 18-3-8-8-3Zm8 3L21 3" />);
export const Loader2 = icon(<path d="M20 12a8 8 0 1 1-8-8" />);
export const Settings = icon(<><path d="m9 3-.5 3-2 1.2L4 6l-2 3 2.5 2v2L2 15l2 3 2.5-1.2 2 1.2.5 3h4l.5-3 2-1.2L18 18l2-3-2.5-2v-2L20 9l-2-3-2.5 1.2-2-1.2L13 3Z" /><circle cx={11} cy={12} r={3} /></>);
export const ModelChoice = icon(<><rect x={5} y={5} width={14} height={14} rx={3}/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/><path d="M9 9h6v6H9z"/></>);
export const Lightbulb = icon(<><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/></>);
