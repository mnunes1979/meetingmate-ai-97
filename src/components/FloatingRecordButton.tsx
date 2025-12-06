import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const FloatingRecordButton = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  // Don't show on recording page (/) or auth page
  if (location.pathname === "/" || location.pathname === "/auth") {
    return null;
  }

  const handleClick = () => {
    navigate("/");
  };

  return (
    <div className="fixed bottom-20 right-4 z-[9999] md:bottom-6 md:right-6">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="lg"
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`
              h-16 w-16 rounded-full shadow-2xl
              transition-all duration-300 ease-out
              bg-primary text-primary-foreground
              hover:bg-primary/90 hover:scale-110 active:scale-95
              border-4 border-primary-foreground/20
              ${isHovered ? 'shadow-[0_0_30px_rgba(var(--primary),0.5)]' : ''}
            `}
            aria-label="Gravar nota rápida"
          >
            <Mic className="h-7 w-7" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-card border-border">
          <p>Gravar Nota Rápida</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
