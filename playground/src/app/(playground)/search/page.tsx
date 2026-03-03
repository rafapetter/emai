'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { SearchResultListView } from '@/components/playground/results/search-result-list';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const API = '/api/emai/search';

export default function SearchPage() {
  // Index
  const [indexLimit, setIndexLimit] = useState('20');
  const index = useEmaiExecute(API, 'index');
  const count = useEmaiExecute(API, 'getIndexedCount');

  // Semantic
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticLimit, setSemanticLimit] = useState('10');
  const semantic = useEmaiExecute(API, 'semantic');

  // Full-text
  const [fullTextQuery, setFullTextQuery] = useState('');
  const fullText = useEmaiExecute(API, 'fullText');

  // Hybrid
  const [hybridQuery, setHybridQuery] = useState('');
  const [alpha, setAlpha] = useState('0.7');
  const hybrid = useEmaiExecute(API, 'hybrid');

  return (
    <>
      <Header title="Search" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <div className="flex gap-4">
          <MethodExecutor
            title="search.index()"
            description="Index emails for search"
            loading={index.loading}
            error={index.error}
            data={index.data}
            duration={index.duration}
            executeLabel="Index"
            onExecute={() => index.execute({ limit: Number(indexLimit) })}
          >
            <div>
              <Label>Emails to index</Label>
              <Input value={indexLimit} onChange={(e) => setIndexLimit(e.target.value)} type="number" />
            </div>
          </MethodExecutor>
        </div>

        <MethodExecutor
          title="search.getIndexedCount()"
          description="Check how many emails are indexed"
          loading={count.loading}
          error={count.error}
          data={count.data}
          duration={count.duration}
          executeLabel="Check"
          onExecute={() => count.execute()}
        >
          <span className="text-sm text-muted-foreground">Click to check the indexed email count</span>
        </MethodExecutor>

        <Tabs defaultValue="semantic">
          <TabsList>
            <TabsTrigger value="semantic">Semantic</TabsTrigger>
            <TabsTrigger value="fulltext">Full-Text</TabsTrigger>
            <TabsTrigger value="hybrid">Hybrid</TabsTrigger>
          </TabsList>

          <TabsContent value="semantic" className="mt-4">
            <MethodExecutor
              title="search.semantic()"
              description="Search by meaning, not just keywords"
              loading={semantic.loading}
              error={semantic.error}
              data={semantic.data}
              duration={semantic.duration}
              executeLabel="Search"
              resultRenderer={(data) => <SearchResultListView data={data} />}
              onExecute={() =>
                semantic.execute({
                  query: semanticQuery,
                  options: { limit: Number(semanticLimit) },
                })
              }
            >
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Label>Query</Label>
                  <Input value={semanticQuery} onChange={(e) => setSemanticQuery(e.target.value)} placeholder="complaints about shipping delays" />
                </div>
                <div>
                  <Label>Limit</Label>
                  <Input value={semanticLimit} onChange={(e) => setSemanticLimit(e.target.value)} type="number" />
                </div>
              </div>
            </MethodExecutor>
          </TabsContent>

          <TabsContent value="fulltext" className="mt-4">
            <MethodExecutor
              title="search.fullText()"
              description="Keyword search with operators (from:, subject:, has:attachment)"
              loading={fullText.loading}
              error={fullText.error}
              data={fullText.data}
              duration={fullText.duration}
              executeLabel="Search"
              resultRenderer={(data) => <SearchResultListView data={data} />}
              onExecute={() => fullText.execute({ query: fullTextQuery })}
            >
              <div>
                <Label>Query</Label>
                <Input value={fullTextQuery} onChange={(e) => setFullTextQuery(e.target.value)} placeholder="from:john subject:invoice has:attachment" />
              </div>
            </MethodExecutor>
          </TabsContent>

          <TabsContent value="hybrid" className="mt-4">
            <MethodExecutor
              title="search.hybrid()"
              description="Combine semantic understanding with keyword precision"
              loading={hybrid.loading}
              error={hybrid.error}
              data={hybrid.data}
              duration={hybrid.duration}
              executeLabel="Search"
              resultRenderer={(data) => <SearchResultListView data={data} />}
              onExecute={() =>
                hybrid.execute({
                  query: hybridQuery,
                  options: { alpha: Number(alpha) },
                })
              }
            >
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Label>Query</Label>
                  <Input value={hybridQuery} onChange={(e) => setHybridQuery(e.target.value)} placeholder="quarterly revenue report" />
                </div>
                <div>
                  <Label>Alpha (0=fulltext, 1=semantic)</Label>
                  <Input value={alpha} onChange={(e) => setAlpha(e.target.value)} type="number" step="0.1" min="0" max="1" />
                </div>
              </div>
            </MethodExecutor>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
