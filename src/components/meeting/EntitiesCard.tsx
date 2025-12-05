import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, User, Users, Calendar, Clock, Edit2, Save, X } from "lucide-react";

interface EntitiesCardProps {
  customerName?: string;
  customerCompany?: string;
  participants?: Array<{ name: string; role?: string }>;
  meetingDatetime?: string;
  meetingDuration?: number;
  onUpdate?: (updates: {
    customerName?: string;
    customerCompany?: string;
    participants?: Array<{ name: string; role?: string }>;
  }) => Promise<void>;
}

export const EntitiesCard = ({
  customerName,
  customerCompany,
  participants,
  meetingDatetime,
  meetingDuration,
  onUpdate,
}: EntitiesCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCustomerName, setEditedCustomerName] = useState(customerName || '');
  const [editedCustomerCompany, setEditedCustomerCompany] = useState(customerCompany || '');
  const [editedParticipants, setEditedParticipants] = useState(participants || []);
  const [isSaving, setIsSaving] = useState(false);

  const participantsList = participants ?? [];
  const hasEntities =
    customerName || customerCompany || participantsList.length > 0 || meetingDatetime;

  if (!hasEntities) return null;

  const handleSave = async () => {
    if (!onUpdate) return;
    setIsSaving(true);
    try {
      await onUpdate({
        customerName: editedCustomerName || undefined,
        customerCompany: editedCustomerCompany || undefined,
        participants: editedParticipants.filter(p => p.name.trim()),
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving changes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedCustomerName(customerName || '');
    setEditedCustomerCompany(customerCompany || '');
    setEditedParticipants(participants || []);
    setIsEditing(false);
  };

  const updateParticipant = (index: number, field: 'name' | 'role', value: string) => {
    const updated = [...editedParticipants];
    updated[index] = { ...updated[index], [field]: value };
    setEditedParticipants(updated);
  };

  const removeParticipant = (index: number) => {
    setEditedParticipants(editedParticipants.filter((_, i) => i !== index));
  };

  const addParticipant = () => {
    setEditedParticipants([...editedParticipants, { name: '', role: '' }]);
  };

  return (
    <Card className="p-6 space-y-4 card-gradient border-border/50">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Detalhes da Reunião</h3>
        {onUpdate && !isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="gap-2"
          >
            <Edit2 className="w-4 h-4" />
            Editar
          </Button>
        )}
        {isEditing && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Guardar
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(customerName || isEditing) && (
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-1">Cliente</p>
              {isEditing ? (
                <Input
                  value={editedCustomerName}
                  onChange={(e) => setEditedCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="h-8"
                />
              ) : (
                <p className="font-medium">{customerName}</p>
              )}
            </div>
          </div>
        )}

        {(customerCompany || isEditing) && (
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-1">Empresa</p>
              {isEditing ? (
                <Input
                  value={editedCustomerCompany}
                  onChange={(e) => setEditedCustomerCompany(e.target.value)}
                  placeholder="Nome da empresa"
                  className="h-8"
                />
              ) : (
                <p className="font-medium">{customerCompany}</p>
              )}
            </div>
          </div>
        )}

        {meetingDatetime && (
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Data e Hora</p>
              <p className="font-medium">
                {new Date(meetingDatetime).toLocaleString('pt-PT', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          </div>
        )}

        {meetingDuration && (
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Duração</p>
              <p className="font-medium">{meetingDuration} minutos</p>
            </div>
          </div>
        )}
      </div>

      {(participantsList.length > 0 || isEditing) && (
        <div className="pt-4 border-t border-border/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Participantes</p>
            </div>
            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={addParticipant}
                className="h-7 text-xs"
              >
                + Adicionar
              </Button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-2">
              {editedParticipants.map((participant, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={participant.name}
                    onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                    placeholder="Nome"
                    className="h-8 flex-1"
                  />
                  <Input
                    value={participant.role || ''}
                    onChange={(e) => updateParticipant(index, 'role', e.target.value)}
                    placeholder="Rol (opcional)"
                    className="h-8 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeParticipant(index)}
                    className="h-8 px-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {participantsList.map((participant, index) => (
                <div
                  key={index}
                  className="px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm"
                >
                  {participant.name}
                  {participant.role && (
                    <span className="ml-1 text-muted-foreground">({participant.role})</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
