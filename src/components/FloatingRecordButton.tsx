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
    <div className="fixed bottom-6 right-6 z-50">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="lg"
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`
              h-14 w-14 rounded-full shadow-lg hover:shadow-xl
              transition-all duration-300 ease-out
              bg-primary hover:bg-primary/90
              hover:scale-110 active:scale-95
              ${isHovered ? 'shadow-glow' : ''}
            `}
            aria-label="Gravar nota rápida"
          >
            <Mic className="h-6 w-6" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-card border-border">
          <p>Gravar Nota Rápida</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
