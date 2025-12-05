import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, Filter, Settings, Trash2, Download, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import AdminLayout from '@/components/admin/AdminLayout';
import { useTranslation } from 'react-i18next';

type SortOption = 'date-asc' | 'date-desc' | 'service-asc' | 'service-desc' | 'provider-asc' | 'provider-desc';

export default function Renewals() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('date-asc');
  
  console.log('[Renewals] Component mounted, sortBy:', sortBy);
  
  const { data: providers } = useQuery({
    queryKey: ['providers-list'],
    queryFn: async () => {
      console.log('[Renewals] Fetching providers...');
      const { data, error } = await supabase
        .from('providers')
        .select('id, name')
        .order('name');
      if (error) {
        console.error('[Renewals] Error fetching providers:', error);
        throw error;
      }
      console.log('[Renewals] Providers fetched:', data?.length);
      return data;
    },
  });

  const { data: renewals, isLoading } = useQuery({
    queryKey: ['renewals', filterType, filterProvider],
    queryFn: async () => {
      console.log('[Renewals] Fetching renewals with filterType:', filterType, 'filterProvider:', filterProvider);
      
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[Renewals] Current user:', user?.id, user?.email);
      
      let query = supabase
        .from('renewals')
        .select(`
          *,
          services!inner (
            id,
            user_id,
            service_name,
            service_type,
            clients ( name ),
            providers ( id, name )
          )
        `)
        .order('renewal_date', { ascending: true });

      const today = new Date().toISOString().split('T')[0];
      
      if (filterType === 'expired') {
        query = query.lt('renewal_date', today).is('renewed_at', null);
      } else if (filterType === 'due-30') {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        query = query
          .gte('renewal_date', today)
          .lte('renewal_date', futureDate.toISOString().split('T')[0])
          .is('renewed_at', null);
      } else if (filterType === 'due-45') {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 45);
        query = query
          .gte('renewal_date', today)
          .lte('renewal_date', futureDate.toISOString().split('T')[0])
          .is('renewed_at', null);
      } else if (filterType === 'active') {
        query = query.is('renewed_at', null);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[Renewals] Error fetching renewals:', error);
        throw error;
      }
      
      console.log('[Renewals] Renewals fetched:', data?.length, 'records');
      
      // Filter by provider if selected
      if (filterProvider !== 'all') {
        const filtered = data.filter(r => r.services?.providers?.id === filterProvider);
        console.log('[Renewals] After provider filter:', filtered.length, 'records');
        return filtered;
      }
      
      return data;
    },
  });

  const deleteServicesMutation = useMutation({
    mutationFn: async (serviceIds: string[]) => {
      console.log('[Renewals] Attempting to delete services:', serviceIds);
      
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[Renewals] Delete initiated by user:', user?.id, user?.email);
      
      // Delete related data first
      const { error: extractionsError } = await supabase
        .from('extractions')
        .delete()
        .in('service_id', serviceIds);
      
      console.log('[Renewals] Extractions deleted');
      if (extractionsError) {
        console.error('[Renewals] Error deleting extractions:', extractionsError);
      }
      
      // Get renewal IDs for these services
      const { data: renewalData, error: renewalFetchError } = await supabase
        .from('renewals')
        .select('id')
        .in('service_id', serviceIds);
      
      if (renewalFetchError) {
        console.error('[Renewals] Error fetching renewals:', renewalFetchError);
      }
      
      const renewalIds = renewalData?.map(r => r.id) || [];
      console.log('[Renewals] Found renewal IDs to delete:', renewalIds.length, renewalIds);
      
      if (renewalIds.length > 0) {
        // Get alert IDs for these renewals
        const { data: alertData } = await supabase
          .from('alerts')
          .select('id')
          .in('renewal_id', renewalIds);
        
        const alertIds = alertData?.map(a => a.id) || [];
        console.log('[Renewals] Found alert IDs:', alertIds.length);
        
        // Delete alert recipients first
        if (alertIds.length > 0) {
          const { error: alertRecipientsError } = await supabase
            .from('alert_recipients')
            .delete()
            .in('alert_id', alertIds);
          
          console.log('[Renewals] Alert recipients deleted');
          if (alertRecipientsError) {
            console.error('[Renewals] Error deleting alert recipients:', alertRecipientsError);
          }
        }
        
        // Delete alerts
        const { error: alertsError } = await supabase
          .from('alerts')
          .delete()
          .in('renewal_id', renewalIds);
        
        console.log('[Renewals] Alerts deleted');
        if (alertsError) {
          console.error('[Renewals] Error deleting alerts:', alertsError);
        }
        
        // Delete renewals
        const { error: renewalsError } = await supabase
          .from('renewals')
          .delete()
          .in('id', renewalIds);
        
        console.log('[Renewals] Renewals deleted');
        if (renewalsError) {
          console.error('[Renewals] Error deleting renewals:', renewalsError);
        }
      }
      
      // Finally delete services
      const { error: servicesError } = await supabase
        .from('services')
        .delete()
        .in('id', serviceIds);
      
      console.log('[Renewals] Services delete attempted');
      if (servicesError) {
        console.error('[Renewals] Error deleting services:', servicesError);
        throw servicesError;
      }
      
      console.log('[Renewals] Successfully deleted all services and related data');
      return { serviceIds, count: serviceIds.length };
    },
    onSuccess: (result) => {
      console.log('[Renewals] Delete mutation successful:', result);
      // Clear local state first
      setSelectedServices(new Set());
      
      // Invalidate all relevant queries to force refetch
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['providers-list'] });
      
      // Force an immediate refetch
      queryClient.refetchQueries({ queryKey: ['renewals', filterType, filterProvider] });
      
      const count = result.serviceIds.length;
      toast.success(t('renewals.deleteSuccess', { count }));
    },
    onError: (error: Error) => {
      console.error('[Renewals] Delete mutation error:', error);
      toast.error(t('renewals.deleteError', { message: error.message }));
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked && renewals) {
      const allServiceIds = renewals.map((r: any) => r.services.id);
      setSelectedServices(new Set(allServiceIds));
    } else {
      setSelectedServices(new Set());
    }
  };

  const handleSelectService = (serviceId: string, checked: boolean) => {
    const newSelected = new Set(selectedServices);
    if (checked) {
      newSelected.add(serviceId);
    } else {
      newSelected.delete(serviceId);
    }
    setSelectedServices(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedServices.size === 0) return;
    
    if (confirm(t('renewals.confirmDelete', { count: selectedServices.size }))) {
      deleteServicesMutation.mutate(Array.from(selectedServices));
    }
  };

  const getStatusBadge = (renewalDate: string, renewedAt: string | null) => {
    if (renewedAt) {
      return <Badge variant="secondary">{t('renewals.renewed')}</Badge>;
    }
    
    const today = new Date();
    const renewal = new Date(renewalDate);
    const daysUntil = Math.ceil((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      return <Badge variant="destructive">{t('renewals.expired')}</Badge>;
    } else if (daysUntil <= 30) {
      return <Badge variant="destructive">{t('renewals.dueInDays', { days: daysUntil })}</Badge>;
    } else if (daysUntil <= 45) {
      return <Badge className="bg-yellow-500">{t('renewals.dueInDays', { days: daysUntil })}</Badge>;
    } else {
      return <Badge variant="outline">{t('renewals.active')}</Badge>;
    }
  };

  const sortRenewals = (data: any[]) => {
    if (!data) return data;

    return [...data].sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':
          return new Date(a.renewal_date).getTime() - new Date(b.renewal_date).getTime();
        case 'date-desc':
          return new Date(b.renewal_date).getTime() - new Date(a.renewal_date).getTime();
        case 'service-asc':
          return (a.services?.service_name || '').localeCompare(b.services?.service_name || '');
        case 'service-desc':
          return (b.services?.service_name || '').localeCompare(a.services?.service_name || '');
        case 'provider-asc':
          return (a.services?.providers?.name || '').localeCompare(b.services?.providers?.name || '');
        case 'provider-desc':
          return (b.services?.providers?.name || '').localeCompare(a.services?.providers?.name || '');
        default:
          return 0;
      }
    });
  };

  const exportToCSV = () => {
    if (!renewals || renewals.length === 0) {
      toast.error(t('renewals.noDataToExport'));
      return;
    }

    // Apply search filter
    let dataToExport = renewals.filter(renewal => {
      if (!searchTerm) return true;
      const service = renewal.services;
      const searchLower = searchTerm.toLowerCase();
      return (
        service?.service_name?.toLowerCase().includes(searchLower) ||
        service?.providers?.name?.toLowerCase().includes(searchLower) ||
        service?.clients?.name?.toLowerCase().includes(searchLower) ||
        service?.service_type?.toLowerCase().includes(searchLower)
      );
    });

    // Apply sorting
    dataToExport = sortRenewals(dataToExport);

    // Create CSV content
    const headers = ['Provider', 'Serviço', 'Tipo', 'Cliente', 'Data Renovação', 'Ciclo', 'Valor', 'Moeda', 'Status'];
    const csvRows = [headers.join(',')];

    dataToExport.forEach((renewal: any) => {
      const service = renewal.services;
      const today = new Date();
      const renewalDate = new Date(renewal.renewal_date);
      const daysUntil = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      let status = 'Active';
      if (renewal.renewed_at) {
        status = 'Renewed';
      } else if (daysUntil < 0) {
        status = 'Expired';
      } else if (daysUntil <= 30) {
        status = `Due in ${daysUntil} days`;
      } else if (daysUntil <= 45) {
        status = `Due in ${daysUntil} days`;
      }

      const row = [
        `"${service?.providers?.name || 'N/A'}"`,
        `"${service?.service_name || ''}"`,
        `"${service?.service_type || ''}"`,
        `"${service?.clients?.name || 'N/A'}"`,
        format(new Date(renewal.renewal_date), 'dd/MM/yyyy'),
        renewal.cycle,
        renewal.amount || '',
        renewal.currency || 'EUR',
        `"${status}"`
      ];
      csvRows.push(row.join(','));
    });

    // Create and download file
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `renovacoes_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(t('renewals.exportSuccess', { count: dataToExport.length }));
  };

  return (
    <AdminLayout title={t('renewals.title')}>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground">{t('renewals.subtitle')}</p>
          {selectedServices.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={deleteServicesMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('renewals.deleteSelected', { count: selectedServices.size })}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/renewals/clients')}
          >
            <Settings className="mr-2 h-4 w-4" />
            {t('renewals.manageClients')}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/renewals/settings')}
          >
            <Settings className="mr-2 h-4 w-4" />
            {t('renewals.settings')}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/renewals/critical')}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            {t('renewals.criticalItems')}
          </Button>
          <Button onClick={() => navigate('/renewals/import')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('renewals.importServices')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {t('renewals.filtersAndSorting')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t('renewals.provider')}</label>
              <Select value={filterProvider} onValueChange={setFilterProvider}>
                <SelectTrigger>
                  <SelectValue placeholder={t('renewals.allProviders')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('renewals.allProviders')}</SelectItem>
                  {providers?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('renewals.search')}</label>
              <Input
                placeholder={t('renewals.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('renewals.sortBy')}</label>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-asc">{t('renewals.sortDateAsc')}</SelectItem>
                  <SelectItem value="date-desc">{t('renewals.sortDateDesc')}</SelectItem>
                  <SelectItem value="service-asc">{t('renewals.sortServiceAsc')}</SelectItem>
                  <SelectItem value="service-desc">{t('renewals.sortServiceDesc')}</SelectItem>
                  <SelectItem value="provider-asc">{t('renewals.sortProviderAsc')}</SelectItem>
                  <SelectItem value="provider-desc">{t('renewals.sortProviderDesc')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={exportToCSV}
              disabled={!renewals || renewals.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              {t('renewals.exportCSV')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={filterType} onValueChange={setFilterType} className="w-full">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
          <TabsTrigger value="due-30">Due ≤ 30 days</TabsTrigger>
          <TabsTrigger value="due-45">Due ≤ 45 days</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
        </TabsList>

        <TabsContent value={filterType} className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8">Loading renewals...</div>
          ) : (() => {
            // Apply search filter
            let filteredRenewals = renewals?.filter(renewal => {
              if (!searchTerm) return true;
              const service = renewal.services;
              const searchLower = searchTerm.toLowerCase();
              return (
                service?.service_name?.toLowerCase().includes(searchLower) ||
                service?.providers?.name?.toLowerCase().includes(searchLower) ||
                service?.clients?.name?.toLowerCase().includes(searchLower) ||
                service?.service_type?.toLowerCase().includes(searchLower)
              );
            });

            // Apply sorting
            filteredRenewals = sortRenewals(filteredRenewals || []);
            
            return filteredRenewals && filteredRenewals.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedServices.size === filteredRenewals?.length && filteredRenewals.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Renewal Date</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRenewals.map((renewal: any) => {
                    const service = renewal.services;
                    const isSelected = selectedServices.has(service.id);
                    return (
                      <TableRow key={renewal.id}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => 
                              handleSelectService(service.id, checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {service?.providers?.name || 'N/A'}
                        </TableCell>
                        <TableCell>{service?.service_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{service?.service_type}</Badge>
                        </TableCell>
                        <TableCell>{service?.clients?.name || 'N/A'}</TableCell>
                        <TableCell>
                          {format(new Date(renewal.renewal_date), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="capitalize">{renewal.cycle}</TableCell>
                        <TableCell>
                          {getStatusBadge(renewal.renewal_date, renewal.renewed_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/renewals/service/${service.id}`)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No renewals found</p>
              <Button
                variant="link"
                onClick={() => navigate('/renewals/import')}
                className="mt-2"
              >
                Import your first services
              </Button>
            </div>
          );
          })()}
        </TabsContent>
      </Tabs>

      </div>
    </AdminLayout>
  );
}