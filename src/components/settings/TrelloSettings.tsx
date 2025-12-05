import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trello, Check, X, ExternalLink } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
}

interface TrelloList {
  id: string;
  name: string;
}

export function TrelloSettings() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [trelloLinked, setTrelloLinked] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedBoardName, setSelectedBoardName] = useState("");
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedListName, setSelectedListName] = useState("");
  const [step, setStep] = useState<"credentials" | "board" | "list" | "done">("credentials");
  const { toast } = useToast();

  useEffect(() => {
    loadTrelloStatus();
  }, []);

  const loadTrelloStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('trello_linked, trello_board_id, trello_board_name, trello_list_id, trello_list_name')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setTrelloLinked(profile?.trello_linked || false);
      setSelectedBoardId(profile?.trello_board_id || "");
      setSelectedBoardName(profile?.trello_board_name || "");
      setSelectedListId(profile?.trello_list_id || "");
      setSelectedListName(profile?.trello_list_name || "");

      if (profile?.trello_linked) {
        setStep("done");
      }
    } catch (error) {
      console.error('Error loading Trello status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadBoards = async () => {
    if (!apiKey || !apiToken) {
      toast({
        title: "Erro",
        description: "Por favor insira API Key e Token",
        variant: "destructive",
      });
      return;
    }

    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('list-trello-boards', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: { api_key: apiKey, api_token: apiToken },
      });

      if (error) throw error;

      setBoards(data.boards || []);
      setStep("board");
      toast({
        title: "Sucesso",
        description: `${data.boards?.length || 0} boards encontrados`,
      });
    } catch (error: any) {
      console.error('Error loading boards:', error);
      let description = 'Erro ao carregar boards. Verifique suas credenciais.';
      try {
        const text = error?.context?.responseText;
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed?.error) description = parsed.error;
        }
      } catch {}
      toast({
        title: 'Erro',
        description,
        variant: 'destructive',
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleSelectBoard = async (boardId: string) => {
    const board = boards.find(b => b.id === boardId);
    if (!board) return;

    setSelectedBoardId(boardId);
    setSelectedBoardName(board.name);
    setConnecting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('list-trello-lists', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: { api_key: apiKey, api_token: apiToken, board_id: boardId },
      });

      if (error) throw error;

      setLists(data.lists || []);
      setStep("list");
    } catch (error: any) {
      console.error('Error loading lists:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao carregar listas",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleSelectList = async (listId: string) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    setSelectedListId(listId);
    setSelectedListName(list.name);
    setConnecting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { error } = await supabase.functions.invoke('connect-trello', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: {
          api_key: apiKey,
          api_token: apiToken,
          board_id: selectedBoardId,
          board_name: selectedBoardName,
          list_id: listId,
          list_name: list.name,
        },
      });

      if (error) throw error;

      setTrelloLinked(true);
      setStep("done");
      toast({
        title: "Conectado!",
        description: `Trello configurado com board "${selectedBoardName}" e lista "${list.name}"`,
      });
    } catch (error: any) {
      console.error('Error connecting Trello:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao conectar Trello",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { error } = await supabase.functions.invoke('disconnect-trello', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;

      setTrelloLinked(false);
      setApiKey("");
      setApiToken("");
      setBoards([]);
      setLists([]);
      setSelectedBoardId("");
      setSelectedBoardName("");
      setSelectedListId("");
      setSelectedListName("");
      setStep("credentials");

      toast({
        title: "Desconectado",
        description: "Trello desconectado com sucesso",
      });
    } catch (error: any) {
      console.error('Error disconnecting:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao desconectar",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trello className="w-5 h-5" />
            Trello
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trello className="w-5 h-5" />
          Trello
        </CardTitle>
        <CardDescription>
          Conecta a tua conta Trello para criar tarefas automaticamente a partir das reuniões
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "done" && trelloLinked ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20">
                <Check className="w-3 h-3 mr-1" />
                Conectado
              </Badge>
              <Button variant="destructive" size="sm" onClick={handleDisconnect}>
                <X className="w-4 h-4 mr-2" />
                Desconectar
              </Button>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border/50 space-y-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Board</p>
                <p className="text-sm font-semibold">{selectedBoardName}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Lista</p>
                <p className="text-sm font-semibold">{selectedListName}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4">
              <div className="flex gap-3">
                <div className="text-blue-600 dark:text-blue-500 mt-0.5">ℹ️</div>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Como obter API Key e Token
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-200">
                    <li>Acesse <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener noreferrer" className="underline">Trello Power-Ups</a></li>
                    <li>Clique em "New" para criar uma nova Power-Up</li>
                    <li>Copie a API Key mostrada</li>
                    <li>Clique em "Token" para gerar um Token</li>
                    <li>Autorize o acesso e copie o Token</li>
                  </ol>
                </div>
              </div>
            </div>

            {step === "credentials" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="text"
                    placeholder="Cole aqui a sua API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiToken">API Token</Label>
                  <Input
                    id="apiToken"
                    type="text"
                    placeholder="Cole aqui o seu Token"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                  />
                </div>

                <Button onClick={handleLoadBoards} disabled={connecting || !apiKey || !apiToken} className="w-full">
                  {connecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      A carregar...
                    </>
                  ) : (
                    "Carregar Boards"
                  )}
                </Button>
              </div>
            )}

            {step === "board" && (
              <div className="space-y-2">
                <Label>Selecionar Board</Label>
                <Select value={selectedBoardId} onValueChange={handleSelectBoard}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher board..." />
                  </SelectTrigger>
                  <SelectContent>
                    {boards.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setStep("credentials")}>
                  Voltar
                </Button>
              </div>
            )}

            {step === "list" && (
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                  <p className="text-sm text-muted-foreground">Board selecionado</p>
                  <p className="font-medium">{selectedBoardName}</p>
                </div>
                <Label>Selecionar Lista</Label>
                <Select value={selectedListId} onValueChange={handleSelectList} disabled={connecting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher lista..." />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setStep("board")} disabled={connecting}>
                  Voltar
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}