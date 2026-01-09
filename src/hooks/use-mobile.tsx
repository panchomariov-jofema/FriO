import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const checkIsMobile = () => {
      return window.innerWidth < MOBILE_BREAKPOINT
    }

    const onChange = () => {
      setIsMobile(checkIsMobile())
    }

    // Listen for both resize and orientation changes
    window.addEventListener("resize", onChange)
    
    // Initial check
    setIsMobile(checkIsMobile())

    return () => {
      window.removeEventListener("resize", onChange)
    }
  }, [])

  return isMobile
}
