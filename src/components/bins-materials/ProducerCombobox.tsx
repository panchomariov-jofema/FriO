'use client';

import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Producer } from '@/lib/types';

interface ProducerComboboxProps {
  producers: Producer[];
  value: string | null;
  onSelect: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  hasExporterSelected?: boolean;
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function ProducerCombobox({
  producers,
  value,
  onSelect,
  disabled,
  loading,
  hasExporterSelected = true,
}: ProducerComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  const sortedProducers = React.useMemo(() => {
    return [...producers].sort((a, b) => {
      const nameA = a.shortName || a.name || '';
      const nameB = b.shortName || b.name || '';
      return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    });
  }, [producers]);

  const filteredProducers = React.useMemo(() => {
    if (!searchTerm.trim()) return sortedProducers;
    const term = normalizeText(searchTerm.trim());
    return sortedProducers.filter((p) => {
      const shortName = normalizeText(p.shortName || '');
      const name = normalizeText(p.name || '');
      const rut = normalizeText(p.rut || '');
      return shortName.includes(term) || name.includes(term) || rut.includes(term);
    });
  }, [sortedProducers, searchTerm]);

  React.useEffect(() => {
    if (!open) {
      setSearchTerm('');
    }
  }, [open]);

  const selectedProducer = React.useMemo(() => {
    return producers.find((p) => p.producerId === value);
  }, [producers, value]);

  let placeholder = 'Seleccione un productor...';
  if (!hasExporterSelected) {
    placeholder = 'Seleccione un exportador primero...';
  } else if (loading) {
    placeholder = 'Cargando productores...';
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducers.length > 0) {
        onSelect(filteredProducers[0].producerId);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="producer-select"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading || !hasExporterSelected}
          className={cn(
            'w-full justify-between font-normal text-left h-11 sm:h-10 text-base sm:text-sm border border-input bg-background px-3',
            !selectedProducer && 'text-muted-foreground'
          )}
        >
          <span className="truncate">
            {selectedProducer ? (selectedProducer.shortName || selectedProducer.name) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[280px] p-2"
        align="start"
      >
        <div className="flex items-center border-b px-2 pb-2 mb-2 gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Escriba para buscar productor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="h-9 sm:h-8 border-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-base sm:text-sm"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm"
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <ScrollArea className="max-h-[260px] overflow-y-auto">
          {filteredProducers.length === 0 ? (
            <div className="text-sm text-center py-6 text-muted-foreground">
              No se encontraron productores.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredProducers.map((p) => {
                const isSelected = p.producerId === value;
                const displayName = p.shortName || p.name;
                return (
                  <button
                    key={p.id || p.producerId}
                    type="button"
                    onClick={() => {
                      onSelect(p.producerId);
                      setOpen(false);
                    }}
                    className={cn(
                      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-2.5 sm:py-1.5 pl-8 pr-2 text-base sm:text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground text-left',
                      isSelected && 'bg-accent/80 font-medium'
                    )}
                  >
                    {isSelected && (
                      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-primary">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                    <span className="truncate">{displayName}</span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
