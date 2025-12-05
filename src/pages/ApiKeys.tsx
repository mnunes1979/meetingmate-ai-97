import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff, Copy, CheckCircle2, AlertCircle, Shield, Edit, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MobileNav } from "@/components/MobileNav";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ApiKeyInfo {
  name: string;
  service: string;
  description: string;
  category: string;
  exists: boolean;
  maskedValue: string;
  canValidate: boolean;
  readonly: boolean;
}

const ApiKeys = () => {
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState<string | null>(null);
  const [revealConfirm, setRevealConfirm] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    setUser(user);

    // Check if user is admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = roles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      toast({
        title: t('common.error'),
        description: t('apiKeys.adminRequired'),
        variant: "destructive"
      });
      navigate("/");
      return;
    }

    loadApiKeys();
  };

  const loadApiKeys = async () => {
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const { data, error } = await supabase.functions.invoke('get-api-keys-info', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      
      if (error) throw error;
      
      setApiKeys(data.apiKeys || []);
    } catch (error: any) {
      console.error('Error loading API keys:', error);
      toast({
        title: t('common.error'),
        description: t('apiKeys.loadError'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRevealKey = async (keyName: string) => {
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const { data, error } = await supabase.functions.invoke('reveal-api-key', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: { keyName }
      });
      
      if (error) throw error;
      
      setRevealedKeys(prev => ({ ...prev, [keyName]: data.keyValue }));
      setRevealConfirm(null);
      
      toast({
        title: t('common.success'),
        description: t('apiKeys.keyRevealed'),
      });
    } catch (error: any) {
      console.error('Error revealing key:', error);
      toast({
        title: t('common.error'),
        description: error.message || t('apiKeys.revealError'),
        variant: "destructive"
      });
    }
  };

  const handleHideKey = (keyName: string) => {
    setRevealedKeys(prev => {
      const newState = { ...prev };
      delete newState[keyName];
      return newState;
    });
  };

  const handleCopyKey = async (keyName: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
      
      toast({
        title: t('common.success'),
        description: t('apiKeys.keyCopied'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('apiKeys.copyError'),
        variant: "destructive"
      });
    }
  };

  const handleValidateKey = async (keyName: string, keyValue: string) => {
    setValidating(keyName);
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const { data, error } = await supabase.functions.invoke('validate-api-key', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: { keyName, keyValue }
      });
      
      if (error) throw error;
      
      toast({
        title: data.valid ? t('common.success') : t('common.error'),
        description: data.message,
        variant: data.valid ? "default" : "destructive"
      });
    } catch (error: any) {
      console.error('Error validating key:', error);
      toast({
        title: t('common.error'),
        description: error.message || t('apiKeys.validateError'),
        variant: "destructive"
      });
    } finally {
      setValidating(null);
    }
  };

  const handleEditKey = (keyName: string) => {
    setEditingKey(keyName);
    setEditValue("");
  };

  const handleSaveKey = async (keyName: string) => {
    if (!editValue.trim()) {
      toast({
        title: t('common.error'),
        description: "Valor da chave é obrigatório",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const { data, error } = await supabase.functions.invoke('update-api-key', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: { keyName, keyValue: editValue, action: 'update' }
      });
      
      if (error) throw error;
      
      setEditingKey(null);
      setEditValue("");
      
      toast({
        title: t('common.success'),
        description: "API key atualizada com sucesso",
      });
      
      // Reload keys to show updated mask
      await loadApiKeys();
    } catch (error: any) {
      console.error('Error updating key:', error);
      toast({
        title: t('common.error'),
        description: error.message || "Erro ao atualizar API key",
        variant: "destructive"
      });
    }
  };

  const handleDeleteKey = async (keyName: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const { data, error } = await supabase.functions.invoke('update-api-key', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: { keyName, action: 'delete' }
      });
      
      if (error) throw error;
      
      setDeletingKey(null);
      
      toast({
        title: t('common.success'),
        description: "API key apagada com sucesso",
      });
      
      // Reload keys
      await loadApiKeys();
    } catch (error: any) {
      console.error('Error deleting key:', error);
      toast({
        title: t('common.error'),
        description: error.message || "Erro ao apagar API key",
        variant: "destructive"
      });
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      "AI Services": "bg-purple-500/10 text-purple-700 dark:text-purple-300",
      "Email Services": "bg-green-500/10 text-green-700 dark:text-green-300",
    };
    return colors[category] || "bg-gray-500/10 text-gray-700 dark:text-gray-300";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Group keys by category
  const groupedKeys = apiKeys.reduce((acc, key) => {
    if (!acc[key.category]) acc[key.category] = [];
    acc[key.category].push(key);
    return acc;
  }, {} as Record<string, ApiKeyInfo[]>);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MobileNav userEmail={user?.email} />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin")}
                className="hidden md:flex"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <h1 className="text-xl md:text-2xl font-bold">Gestão de API Keys</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Visão Geral de API Keys</CardTitle>
            <CardDescription>Gerir as chaves de API dos serviços integrados</CardDescription>
          </CardHeader>
        </Card>

        {Object.entries(groupedKeys).map(([category, keys]) => (
          <Card key={category} className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge className={getCategoryColor(category)}>
                  {category === 'AI Services' ? 'Serviços de IA' : category === 'Email Services' ? 'Serviços de Email' : category}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  ({keys.length} {keys.length === 1 ? 'chave' : 'chaves'})
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((apiKey) => {
                    const isRevealed = !!revealedKeys[apiKey.name];
                    const displayValue = isRevealed ? revealedKeys[apiKey.name] : apiKey.maskedValue;
                    const isCopied = copiedKey === apiKey.name;

                    return (
                      <TableRow key={apiKey.name}>
                        <TableCell className="font-medium">
                          <div>
                            <div>{apiKey.service}</div>
                            <div className="text-xs text-muted-foreground font-mono">{apiKey.name}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs">
                          {apiKey.description}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {displayValue}
                        </TableCell>
                        <TableCell>
                          {apiKey.exists ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-300">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Configurado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-300">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Não Configurado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {apiKey.exists ? (
                              <>
                                {!isRevealed ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRevealConfirm(apiKey.name)}
                                    disabled={!apiKey.exists}
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    Revelar
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleHideKey(apiKey.name)}
                                  >
                                    <EyeOff className="w-4 h-4 mr-1" />
                                    Ocultar
                                  </Button>
                                )}
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopyKey(apiKey.name, isRevealed ? revealedKeys[apiKey.name] : apiKey.maskedValue)}
                                  disabled={!apiKey.exists || !isRevealed}
                                >
                                  {isCopied ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </Button>

                                {apiKey.canValidate && isRevealed && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleValidateKey(apiKey.name, revealedKeys[apiKey.name])}
                                    disabled={validating === apiKey.name}
                                  >
                                    {validating === apiKey.name ? (
                                      <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                                    ) : (
                                      "Validar"
                                    )}
                                  </Button>
                                )}

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditKey(apiKey.name)}
                                >
                                  <Edit className="w-4 h-4 mr-1" />
                                  Editar
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                  onClick={() => setDeletingKey(apiKey.name)}
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Apagar
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleEditKey(apiKey.name)}
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Configurar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              Aviso de Segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Todas as visualizações e alterações de API keys são registadas</p>
            <p>• Nunca partilhe as suas API keys com terceiros</p>
            <p>• Regenere as chaves periodicamente por razões de segurança</p>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={!!revealConfirm} onOpenChange={() => setRevealConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revelar API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que pretende revelar esta API key? Esta ação será registada por razões de segurança.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => revealConfirm && handleRevealKey(revealConfirm)}>
              Revelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!editingKey} onOpenChange={() => { setEditingKey(null); setEditValue(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editar API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Introduza o novo valor para esta API key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="keyValue" className="text-sm font-medium mb-2 block">
              Novo Valor
            </Label>
            <Input
              id="keyValue"
              type="password"
              placeholder="Introduza o novo valor..."
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Após guardar, a API key anterior será substituída permanentemente.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setEditingKey(null); setEditValue(""); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => editingKey && handleSaveKey(editingKey)}>
              Guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingKey} onOpenChange={() => setDeletingKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que pretende apagar esta API key? Esta ação é irreversível e a funcionalidade associada deixará de funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingKey && handleDeleteKey(deletingKey)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ApiKeys;
