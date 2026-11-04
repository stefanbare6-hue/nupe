/** Ícones de traço, 1.75px, sem preenchimento. Decorativos: sempre aria-hidden. */
type P = { size?: number };

function Svg({ size = 18, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconePainel = (p: P) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </Svg>
);
export const IconeColetas = (p: P) => (
  <Svg {...p}>
    <path d="M7 4h10v3H7z" />
    <path d="M7 5.5H4V21h16V5.5h-3" />
    <path d="M8.5 12.5h7M8.5 16.5h5" />
  </Svg>
);
export const IconeResultados = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M7 20v-6M12 20V7M17 20v-9" />
  </Svg>
);
export const IconeFichas = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M4 9h16M10 9v12M15 9v12" />
  </Svg>
);
export const IconeMatrizes = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M12 4v16M4 12h16" />
  </Svg>
);
export const IconeRelatorio = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </Svg>
);
export const IconeMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconeFechar = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconeSeta = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconeCheck = (p: P) => (
  <Svg {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Svg>
);
export const IconeCalendario = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const IconeLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3" />
    <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3" />
  </Svg>
);
export const IconeAlerta = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 21.5 20h-19z" />
    <path d="M12 10v4.5M12 17.2v.1" />
  </Svg>
);
export const IconeDocumento = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 13h6M9 17h4" />
  </Svg>
);
export const IconeGrupo = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.4a3.2 3.2 0 0 1 0 6.2M17.5 14.2A5.4 5.4 0 0 1 21 19.4" />
  </Svg>
);
export const IconeFormando = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 9 12 4.5 21.5 9 12 13.5z" />
    <path d="M6.5 11v4.5c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3V11" />
    <path d="M21.5 9v5" />
  </Svg>
);
export const IconePessoa = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </Svg>
);
export const IconeCadeado = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Svg>
);

/** Ícone por público, dentro de um círculo azul. */
export function IconePublico({ publico, size = 22 }: { publico: string; size?: number }) {
  if (publico === "docentes") return <IconeFormando size={size} />;
  if (publico === "equipe") return <IconePessoa size={size} />;
  return <IconeGrupo size={size} />;
}

/** Monograma: N desenhado em duas hastes, o ponto é o único laranja da marca. */
export function Marca({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="39" height="39" rx="10" fill="#ffffff" />
      <path d="M11 29.5V11h3.2L26 25.8V11h2.4v18.5h-3.2L14 15v14.5z" fill="#172b4d" />
      <circle cx="29.2" cy="11.2" r="2.6" fill="#c8581d" />
    </svg>
  );
}
