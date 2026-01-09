import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const checkIsMobile = () => {
      // Check for touch screen and likely mobile device based on pointer type,
      // as well as the viewport width. This handles landscape mode on phones.
      const isTouchDevice = window.matchMedia("(pointer: coarse)").matches
      return window.innerWidth < MOBILE_BREAKPOINT || isTouchDevice
    }

    const onChange = () => {
      setIsMobile(checkIsMobile())
    }

    // Listen for both resize and orientation changes
    window.addEventListener("resize", onChange)
    window.addEventListener("orientationchange", onChange)
    
    // Initial check
    setIsMobile(checkIsMobile())

    return () => {
      window.removeEventListener("resize", onChange)
      window.removeEventListener("orientationchange", onChange)
    }
  }, [])

  return isMobile
}
