import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Save, Loader2, Plus } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { format } from 'date-fns';

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClientData, setNewClientData] = useState({
    name: '',
    email: '',
    notes: '',
  });

  const { data: service, isLoading } = useQuery({
    queryKey: ['service', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select(`
          *,
          providers (id, name),
          clients (id, name, active),
          renewals (*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: clients } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, active')
        .eq('active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const [formData, setFormData] = useState({
    service_name: '',
    service_type: '',
    provider_id: '',
    client_id: '',
  });

  const updateServiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from('services')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service', id] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      toast.success('Service updated successfully');
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast.error('Failed to update service: ' + error.message);
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (data: typeof newClientData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: client, error } = await supabase
        .from('clients')
        .insert([{ ...data, user_id: user.id }])
        .select('id')
        .single();

      if (error) throw error;
      return client;
    },
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      toast.success('Client created successfully');
      setFormData({ ...formData, client_id: client.id });
      setShowCreateClient(false);
      setNewClientData({ name: '', email: '', notes: '' });
    },
    onError: (error: Error) => {
      toast.error('Failed to create client: ' + error.message);
    },
  });

  const handleEdit = () => {
    if (service) {
      setFormData({
        service_name: service.service_name || '',
        service_type: service.service_type || '',
        provider_id: service.provider_id || '',
        client_id: service.client_id || 'none',
      });
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    const dataToSave = {
      ...formData,
      client_id: formData.client_id === 'none' ? null : formData.client_id,
    };
    updateServiceMutation.mutate(dataToSave);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleCreateClient = () => {
    if (!newClientData.name.trim()) {
      toast.error('Client name is required');
      return;
    }
    createClientMutation.mutate(newClientData);
  };

  if (isLoading) {
    return (
      <AdminLayout title="Service Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!service) {
    return (
      <AdminLayout title="Service Details">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Service not found</p>
          <Button
            variant="link"
            onClick={() => navigate('/renewals')}
            className="mt-4"
          >
            Back to Renewals
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Service Details">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate('/renewals')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Renewals
          </Button>
          {!isEditing ? (
            <Button onClick={handleEdit}>
              Edit Service
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateServiceMutation.isPending}>
                {updateServiceMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Service Information</CardTitle>
            <CardDescription>View and edit service details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Provider</Label>
                {isEditing ? (
                  <Input
                    value={formData.provider_id}
                    onChange={(e) => setFormData({ ...formData, provider_id: e.target.value })}
                    placeholder="Provider name"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {service.providers?.name || 'N/A'}
                  </p>
                )}
              </div>

              <div>
                <Label>Service Name</Label>
                {isEditing ? (
                  <Input
                    value={formData.service_name}
                    onChange={(e) => setFormData({ ...formData, service_name: e.target.value })}
                    placeholder="Service name"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {service.service_name || 'N/A'}
                  </p>
                )}
              </div>

              <div>
                <Label>Service Type</Label>
                {isEditing ? (
                  <Select
                    value={formData.service_type}
                    onValueChange={(value) => setFormData({ ...formData, service_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domain">Domain</SelectItem>
                      <SelectItem value="hosting">Hosting</SelectItem>
                      <SelectItem value="vps">VPS</SelectItem>
                      <SelectItem value="cdn">CDN</SelectItem>
                      <SelectItem value="mx">Email/MX</SelectItem>
                      <SelectItem value="ssl">SSL Certificate</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground capitalize">
                    {service.service_type || 'N/A'}
                  </p>
                )}
              </div>

              <div>
                <Label>Client</Label>
                {isEditing ? (
                  <div className="space-y-2">
                    <Select
                      value={formData.client_id}
                      onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No client</SelectItem>
                        {clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowCreateClient(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create New Client
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {service.clients?.name || 'N/A'}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {service.renewals && service.renewals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Renewal Information</CardTitle>
              <CardDescription>Current renewal details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {service.renewals.map((renewal: any) => (
                  <div key={renewal.id}>
                    <div className="mb-4">
                      <Label>Renewal Date</Label>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(renewal.renewal_date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div>
                      <Label>Cycle</Label>
                      <p className="text-sm text-muted-foreground capitalize">
                        {renewal.cycle || 'N/A'}
                      </p>
                    </div>
                    {renewal.renewed_at && (
                      <div className="mt-4">
                        <Label>Renewed At</Label>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(renewal.renewed_at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showCreateClient} onOpenChange={setShowCreateClient}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
            <DialogDescription>
              Add a new client to associate with this service
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="client-name">Name *</Label>
              <Input
                id="client-name"
                value={newClientData.name}
                onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                placeholder="Client name"
              />
            </div>
            <div>
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={newClientData.email}
                onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })}
                placeholder="client@example.com"
              />
            </div>
            <div>
              <Label htmlFor="client-notes">Notes</Label>
              <Input
                id="client-notes"
                value={newClientData.notes}
                onChange={(e) => setNewClientData({ ...newClientData, notes: e.target.value })}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateClient(false)}
              disabled={createClientMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={createClientMutation.isPending}
            >
              {createClientMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Client'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
