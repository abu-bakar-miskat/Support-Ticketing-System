export function PenLogo() {
  return (
    <div
      className="relative h-[54px] w-[180px] shrink-0"
      aria-label="PEN Group"
      role="img"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/pen-logo-light.svg"
        alt=""
        width={180}
        height={55}
        className="absolute inset-0 size-full dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/pen-logo-dark.svg"
        alt=""
        width={180}
        height={55}
        className="absolute inset-0 hidden size-full dark:block"
      />
    </div>
  )
}
