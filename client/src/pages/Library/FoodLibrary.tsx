import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Edit2, Trash2, Image } from 'lucide-react';
import { api } from '../../api/client';
import type { Food } from '../../types';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import ImageGallery from '../../components/ui/ImageGallery';

export default function FoodLibrary() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editFood, setEditFood] = useState<Food | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: foods = [], isLoading } = useQuery({
    queryKey: ['foods', search],
    queryFn: () => api.get<Food[]>(`/foods?search=${encodeURIComponent(search)}`),
  });

  const deleteFood = useMutation({
    mutationFn: (id: number) => api.delete(`/foods/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
    onError: (err: Error) => alert(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Food Library</h1>
          <p className="text-xs text-gray-500 mt-0.5">{foods.length} items</p>
        </div>
        <Button onClick={() => setShowAdd(true)} size="sm">
          <Plus size={14} /> Add Food
        </Button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          placeholder="Search foods…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <div className="text-center py-8 text-gray-600 text-sm">Loading…</div>}

      {!isLoading && foods.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-sm">{search ? `No results for "${search}"` : 'No foods yet.'}</p>
          <p className="text-xs mt-1">Add your first food to get started.</p>
        </div>
      )}

      <div className="space-y-2">
        {foods.map(food => (
          <FoodCard
            key={food.id}
            food={food}
            onEdit={() => setEditFood(food)}
            onDelete={() => { if (confirm(`Delete "${food.name}"?`)) deleteFood.mutate(food.id); }}
          />
        ))}
      </div>

      <FoodFormModal
        open={showAdd || !!editFood}
        food={editFood}
        onClose={() => { setShowAdd(false); setEditFood(null); }}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['foods'] }); setShowAdd(false); setEditFood(null); }}
      />
    </div>
  );
}

function FoodCard({ food, onEdit, onDelete }: { food: Food; onEdit: () => void; onDelete: () => void }) {
  const { data: images = [] } = useQuery<{ url: string; id: number }[]>({
    queryKey: ['images', 'food', food.id],
    queryFn: () => api.get(`/images/food/${food.id}`),
  });
  const thumb = images[0];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3.5 flex items-center gap-3">
      {thumb ? (
        <img src={thumb.url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
          <Image size={18} className="text-gray-600" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{food.name}</p>
          {food.brand && <span className="text-xs text-gray-500 shrink-0">{food.brand}</span>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Per {food.serving_size} {food.serving_unit}:
          {' '}<span className="text-white">{food.calories} kcal</span>
          {' · '}<span className="text-blue-400">{food.protein_g}g P</span>
          {' · '}<span className="text-yellow-400">{food.carbs_g}g C</span>
          {' · '}<span className="text-orange-400">{food.fat_g}g F</span>
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
          <Edit2 size={14} />
        </button>
        <button onClick={onDelete} className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function FoodFormModal({ open, food, onClose, onSaved }: {
  open: boolean; food: Food | null; onClose: () => void; onSaved: () => void;
}) {
  const blank: Partial<Food> = {
    name: '', brand: '', serving_size: 100, serving_unit: 'g',
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    saturated_fat_g: 0, fiber_g: 0, sugar_g: 0,
    cholesterol_mg: 0, sodium_mg: 0, potassium_mg: 0,
  };
  const [form, setForm] = useState<Partial<Food>>(food ?? blank);

  const save = useMutation({
    mutationFn: () => food
      ? api.put(`/foods/${food.id}`, form)
      : api.post('/foods', form),
    onSuccess: onSaved,
  });

  if (food && food.id !== (form as any)._synced) {
    setForm({ ...blank, ...food, _synced: food.id } as any);
  }

  const num = (k: keyof Food) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }));
  const str = (k: keyof Food) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={onClose} title={food ? 'Edit Food' : 'Add Food'} size="md">
      <div className="space-y-3">
        <Input label="Food name *" value={form.name ?? ''} onChange={str('name')} placeholder="e.g. Chicken Breast" />
        <Input label="Brand (optional)" value={form.brand ?? ''} onChange={str('brand')} placeholder="e.g. Generic" />

        <div className="bg-gray-800/50 rounded-xl p-3 space-y-3">
          <p className="text-xs font-medium text-gray-400">Serving size</p>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Amount" type="number" value={form.serving_size ?? 100} onChange={num('serving_size')} />
            <Input label="Unit" value={form.serving_unit ?? 'g'} onChange={str('serving_unit')} placeholder="g / oz / serving / cup…" />
          </div>
        </div>

        <div className="bg-gray-800/50 rounded-xl p-3 space-y-3">
          <p className="text-xs font-medium text-gray-400">Macros per serving above</p>
          <div className="grid grid-cols-3 gap-2">
            <Input label="Calories" type="number" value={form.calories ?? 0} onChange={num('calories')} />
            <Input label="Protein (g)" type="number" value={form.protein_g ?? 0} onChange={num('protein_g')} />
            <Input label="Carbs (g)" type="number" value={form.carbs_g ?? 0} onChange={num('carbs_g')} />
            <Input label="Fat (g)" type="number" value={form.fat_g ?? 0} onChange={num('fat_g')} />
            <Input label="Fiber (g)" type="number" value={form.fiber_g ?? 0} onChange={num('fiber_g')} />
            <Input label="Sugar (g)" type="number" value={form.sugar_g ?? 0} onChange={num('sugar_g')} />
          </div>
        </div>

        <div className="bg-gray-800/50 rounded-xl p-3 space-y-3">
          <p className="text-xs font-medium text-gray-400">Full nutrition label <span className="text-gray-600 font-normal">(optional)</span></p>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Saturated Fat (g)" type="number" step="0.1" value={form.saturated_fat_g ?? 0} onChange={num('saturated_fat_g')} />
            <Input label="Cholesterol (mg)" type="number" value={form.cholesterol_mg ?? 0} onChange={num('cholesterol_mg')} />
            <Input label="Sodium (mg)" type="number" value={form.sodium_mg ?? 0} onChange={num('sodium_mg')} />
            <Input label="Potassium (mg)" type="number" value={form.potassium_mg ?? 0} onChange={num('potassium_mg')} />
          </div>
        </div>

        {food && (
          <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-medium text-gray-400">Photos</p>
            <ImageGallery entityType="food" entityId={food.id} />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending} className="flex-1">
            {save.isPending ? 'Saving…' : food ? 'Save Changes' : 'Add Food'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
