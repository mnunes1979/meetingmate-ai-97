import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Clock, Mail, Filter, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import { useTranslation } from 'react-i18next';

export default function CriticalItems() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('45');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showRenewalDialog, setShowRenewalDialog] = useState(false);
  const [selectedRenewal, setSelectedRenewal] = useState<any>(null);
  const [renewalYears, setRenewalYears] = useState<string>('1');

  const { data: providers } = useQuery({
    queryKey: ['providers-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('providers')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
  });


  const { data: criticalData, isLoading } = useQuery({
    queryKey: ['critical-renewals', filterProvider, filterPeriod],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + parseInt(filterPeriod));

      let query = supabase
        .from('renewals')
        .select(`
          *,
          services (
            id,
            service_name,
            service_type,
            clients ( name, email ),
            providers ( id, name )
          )
        `)
        .is('renewed_at', null)
        .lte('renewal_date', futureDate.toISOString().split('T')[0])
        .order('renewal_date', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;

      // Filter by provider if selected
      let filteredData = data;
      if (filterProvider !== 'all') {
        filteredData = data.filter(r => r.services?.providers?.id === filterProvider);
      }

      const expired = filteredData.filter(r => new Date(r.renewal_date) < new Date(today));
      const dueSoon = filteredData.filter(r => {
        const date = new Date(r.renewal_date);
        return date >= new Date(today) && date <= futureDate;
      });

      return { expired, dueSoon, all: filteredData };
    },
  });

  const markRenewedMutation = useMutation({
    mutationFn: async ({ renewalId, years }: { renewalId: string; years: number }) => {
      // Get the current renewal to calculate new date
      const { data: renewal, error: fetchError } = await supabase
        .from('renewals')
        .select('renewal_date')
        .eq('id', renewalId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Calculate new renewal date by adding years to the ORIGINAL date
      const originalDate = new Date(renewal.renewal_date);
      const newRenewalDate = new Date(originalDate);
      newRenewalDate.setFullYear(originalDate.getFullYear() + years);
      
      const { error } = await supabase
        .from('renewals')
        .update({ 
          renewed_at: new Date().toISOString(),
          renewal_date: newRenewalDate.toISOString().split('T')[0]
        })
        .eq('id', renewalId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical-renewals'] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      setShowRenewalDialog(false);
      setSelectedRenewal(null);
      setRenewalYears('1');
      toast.success('Serviço marcado como renovado com sucesso');
    },
    onError: () => {
      toast.error('Erro ao atualizar estado da renovação');
    },
  });

  const handleMarkRenewed = (renewal: any) => {
    setSelectedRenewal(renewal);
    setShowRenewalDialog(true);
  };

  const confirmMarkRenewed = () => {
    if (selectedRenewal) {
      markRenewedMutation.mutate({ 
        renewalId: selectedRenewal.id, 
        years: parseInt(renewalYears) 
      });
    }
  };

  const snoozeMutation = useMutation({
    mutationFn: async ({ renewalId, days }: { renewalId: string; days: number }) => {
      // Get the alert for this renewal
      const { data: alerts } = await supabase
        .from('alerts')
        .select('id')
        .eq('renewal_id', renewalId)
        .eq('status', 'pending')
        .limit(1);

      if (alerts && alerts.length > 0) {
        const snoozeUntil = new Date();
        snoozeUntil.setDate(snoozeUntil.getDate() + days);

        const { error } = await supabase
          .from('alerts')
          .update({ 
            snoozed_until: snoozeUntil.toISOString().split('T')[0],
            status: 'snoozed'
          })
          .eq('id', alerts[0].id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical-renewals'] });
      toast.success('Alert snoozed');
    },
  });

  const getDaysUntil = (renewalDate: string) => {
    const today = new Date();
    const renewal = new Date(renewalDate);
    return Math.ceil((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const renderRenewalRow = (renewal: any) => {
    const service = renewal.services;
    const daysUntil = getDaysUntil(renewal.renewal_date);
    const isExpired = daysUntil < 0;

    return (
      <TableRow key={renewal.id} className={isExpired ? 'bg-destructive/10' : ''}>
        <TableCell>
          {isExpired ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <Clock className="h-5 w-5 text-yellow-500" />
          )}
        </TableCell>
        <TableCell className="font-medium">{service?.providers?.name || 'N/A'}</TableCell>
        <TableCell>{service?.service_name}</TableCell>
        <TableCell>
          <Badge variant="outline">{service?.service_type}</Badge>
        </TableCell>
        <TableCell>{service?.clients?.name || 'N/A'}</TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span>{format(new Date(renewal.renewal_date), 'dd/MM/yyyy')}</span>
            <span className="text-xs text-muted-foreground">
              {isExpired ? `${Math.abs(daysUntil)} days overdue` : `${daysUntil} days left`}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/renewals/service/${service.id}`)}
            >
              View
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => handleMarkRenewed(renewal)}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Mark Renewed
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => snoozeMutation.mutate({ renewalId: renewal.id, days: 7 })}
            >
              Snooze 7d
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading critical items...</div>
      </div>
    );
  }

  const { expired = [], dueSoon = [] } = criticalData || {};
  
  // Apply search filter
  const filterBySearch = (items: any[]) => {
    if (!searchTerm) return items;
    return items.filter(r => {
      const service = r.services;
      const searchLower = searchTerm.toLowerCase();
      return (
        service?.service_name?.toLowerCase().includes(searchLower) ||
        service?.providers?.name?.toLowerCase().includes(searchLower) ||
        service?.clients?.name?.toLowerCase().includes(searchLower)
      );
    });
  };

  const filteredExpired = filterBySearch(expired);
  const filteredDueSoon = filterBySearch(dueSoon);
  const hasItems = filteredExpired.length > 0 || filteredDueSoon.length > 0;

  return (
    <AdminLayout title={t('renewals.criticalItemsTitle')}>
      <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <p className="text-muted-foreground">
          {t('renewals.criticalItemsDesc')}
        </p>
        <Button variant="outline" onClick={() => navigate('/renewals')}>
          {t('renewals.backToAll')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros Avançados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Provider</label>
              <Select value={filterProvider} onValueChange={setFilterProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os providers</SelectItem>
                  {providers?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Período</label>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Próximos 7 dias</SelectItem>
                  <SelectItem value="15">Próximos 15 dias</SelectItem>
                  <SelectItem value="30">Próximos 30 dias (Mês atual)</SelectItem>
                  <SelectItem value="45">Próximos 45 dias</SelectItem>
                  <SelectItem value="60">Próximos 60 dias</SelectItem>
                  <SelectItem value="90">Próximos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Pesquisar</label>
              <Input
                placeholder="Serviço, provider ou cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!hasItems ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">All Clear!</h2>
              <p className="text-muted-foreground">
                No expired or critical renewals at this time
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {filteredExpired.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Expired Services ({filteredExpired.length})
                </CardTitle>
                <CardDescription>These services have passed their renewal date</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Renewal Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpired.map(renderRenewalRow)}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {filteredDueSoon.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-yellow-500" />
                  Due Soon ({filteredDueSoon.length})
                </CardTitle>
                <CardDescription>Services expiring within 45 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Renewal Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDueSoon.map(renderRenewalRow)}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Renewal Period Dialog */}
      <AlertDialog open={showRenewalDialog} onOpenChange={setShowRenewalDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como Renovado</AlertDialogTitle>
            <AlertDialogDescription>
              Por quantos anos deseja renovar este serviço?
              <br />
              <span className="text-sm text-muted-foreground mt-2 block">
                A nova data será calculada a partir da data original de renovação: 
                {selectedRenewal && <strong className="ml-1">
                  {format(new Date(selectedRenewal.renewal_date), 'dd/MM/yyyy')}
                </strong>}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="renewal-years" className="mb-2 block">Período de renovação</Label>
            <Select value={renewalYears} onValueChange={setRenewalYears}>
              <SelectTrigger id="renewal-years">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 ano</SelectItem>
                <SelectItem value="2">2 anos</SelectItem>
                <SelectItem value="3">3 anos</SelectItem>
                <SelectItem value="4">4 anos</SelectItem>
                <SelectItem value="5">5 anos</SelectItem>
                <SelectItem value="6">6 anos</SelectItem>
                <SelectItem value="7">7 anos</SelectItem>
                <SelectItem value="8">8 anos</SelectItem>
                <SelectItem value="9">9 anos</SelectItem>
                <SelectItem value="10">10 anos</SelectItem>
              </SelectContent>
            </Select>
            {selectedRenewal && (
              <div className="mt-3 p-3 bg-muted rounded-md">
                <p className="text-sm">
                  <strong>Nova data de renovação:</strong>{' '}
                  {(() => {
                    const originalDate = new Date(selectedRenewal.renewal_date);
                    const newDate = new Date(originalDate);
                    newDate.setFullYear(originalDate.getFullYear() + parseInt(renewalYears));
                    return format(newDate, 'dd/MM/yyyy');
                  })()}
                </p>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={markRenewedMutation.isPending}
              onClick={() => {
                setShowRenewalDialog(false);
                setSelectedRenewal(null);
                setRenewalYears('1');
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmMarkRenewed}
              disabled={markRenewedMutation.isPending}
            >
              {markRenewedMutation.isPending ? 'A processar...' : 'Confirmar Renovação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </AdminLayout>
  );
}