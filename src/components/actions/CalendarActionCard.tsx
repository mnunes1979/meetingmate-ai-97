import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CalendarEvent {
  title: string;
  description?: string;
  proposed_datetime_iso: string;
  duration_min: number;
  attendees: Array<{ name: string; email?: string }>;
  notes?: string;
}

interface CalendarActionCardProps {
  event: CalendarEvent;
  onAdd: (eventDetails: any) => void;
}

export const CalendarActionCard = ({ event, onAdd }: CalendarActionCardProps) => {
  const [attendeeEmails, setAttendeeEmails] = useState<Record<number, string>>({});
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const { toast } = useToast();

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('ca-ES', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
  };

  const getEndTime = () => {
    const start = new Date(event.proposed_datetime_iso);
    const end = new Date(start.getTime() + event.duration_min * 60000);
    return end.toISOString();
  };

  const handleEmailChange = (index: number, email: string) => {
    setAttendeeEmails(prev => ({ ...prev, [index]: email }));
  };

  const checkAvailability = async () => {
    setIsChecking(true);
    try {
      // For now, we'll simulate checking - real implementation would need Google OAuth
      toast({
        title: "Verificant disponibilitat...",
        description: "Funcionalitat de verificació en desenvolupament. Continueu amb l'addició.",
      });
      
      // Simulate a check
      setTimeout(() => {
        setIsAvailable(true);
        setIsChecking(false);
      }, 1000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "No es pot verificar la disponibilitat en aquest moment",
        variant: "destructive",
      });
      setIsChecking(false);
    }
  };

  const handleAddToCalendar = () => {
    const attendeesWithEmails = event.attendees.map((attendee, idx) => ({
      name: attendee.name,
      email: attendeeEmails[idx] || attendee.email || '',
    }));

    onAdd({
      title: event.title,
      description: event.description,
      startTime: event.proposed_datetime_iso,
      endTime: getEndTime(),
      attendees: attendeesWithEmails,
    });
  };

  return (
    <Card className="p-6 space-y-4 card-gradient border-border/50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-action-calendar/10">
            <Calendar className="w-5 h-5 text-action-calendar" />
          </div>
          <div>
            <h3 className="font-semibold">Afegir al Calendari</h3>
            <p className="text-sm text-muted-foreground mt-1">{event.title}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
          <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">Data i Hora</p>
            <p className="text-sm text-foreground">{formatDateTime(event.proposed_datetime_iso)}</p>
            <p className="text-xs text-muted-foreground mt-1">Duració: {event.duration_min} minuts</p>
          </div>
          {isAvailable === true && (
            <Badge variant="outline" className="bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Disponible
            </Badge>
          )}
          {isAvailable === false && (
            <Badge variant="outline" className="bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20">
              <AlertCircle className="w-3 h-3 mr-1" />
              Conflicte
            </Badge>
          )}
        </div>

        {event.description && (
          <div className="p-3 rounded-lg bg-background/50 border border-border/50">
            <p className="text-sm font-medium text-muted-foreground mb-1">Descripció</p>
            <p className="text-sm">{event.description}</p>
          </div>
        )}

        {event.attendees && event.attendees.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Assistents</p>
            </div>
            <div className="space-y-2">
              {event.attendees.map((attendee, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-sm font-medium min-w-[120px]">{attendee.name}</span>
                  <Input
                    type="email"
                    placeholder="correu@example.com"
                    value={attendeeEmails[idx] || attendee.email || ''}
                    onChange={(e) => handleEmailChange(idx, e.target.value)}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="p-3 rounded-lg bg-sentiment-negative/10 border border-sentiment-negative/20">
            <p className="text-sm font-medium text-sentiment-negative mb-2">Conflictes detectats:</p>
            {conflicts.map((conflict, idx) => (
              <p key={idx} className="text-xs text-muted-foreground">
                • {conflict.summary} ({new Date(conflict.start).toLocaleTimeString()})
              </p>
            ))}
          </div>
        )}

        {event.notes && (
          <div className="p-3 rounded-lg bg-background/50 border border-border/50">
            <p className="text-xs text-muted-foreground">{event.notes}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          onClick={checkAvailability}
          disabled={isChecking}
          className="gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          {isChecking ? "Verificant..." : "Verificar Disponibilitat"}
        </Button>
        <Button
          onClick={handleAddToCalendar}
          className="gap-2 flex-1"
        >
          <Calendar className="w-4 h-4" />
          Afegir al Calendari
        </Button>
      </div>
    </Card>
  );
};
