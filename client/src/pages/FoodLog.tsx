import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Meal, MealType, Food } from '../types';
import { MacroPills, MacroBar } from '../components/ui/MacroDisplay';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import ImageGallery from '../components/ui/ImageGallery';

interface OutletCtx { userId: number; }

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast',    label: '🌅 Breakfast' },
  { value: 'lunch',        label: '☀️ Lunch' },
  { value: 'dinner',       label: '🌙 Dinner' },
  { value: 'snack',        label: '🍎 Snack' },
  { value: 'pre_workout',  label: '⚡ Pre-workout' },
  { value: 'post_workout', label: '💪 Post-workout' },
];

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

export default function FoodLog({ userId: propUserId }: { userId?: number }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;
  const qc = useQueryClient();

  const [date] = useState(fmt(new Date()));
  const [addMealOpen, setAddMealOpen] = useState(false);
  const [addFoodOpen, setAddFoodOpen] = useState<number | null>(null); // mealId
  const [expandedMeals, setExpandedMeals] = useState<Set<number>>(new Set());

  const { data: meals = [] } = useQuery({
    queryKey: ['meals', userId, date],
    queryFn: () => api.get<Meal[]>(`/meals/user/${userId}?date=${date}`),
    enabled: !!userId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['meals', userId, date] });
  const invalidateDash = () => qc.invalidateQueries({ queryKey: ['daily-summary', userId] });

  const createMeal = useMutation({
    mutationFn: (data: { meal_type: MealType; user_id: number }) => api.post<Meal>('/meals', data),
    onSuccess: (meal) => {
      invalidate(); invalidateDash();
      setAddMealOpen(false);
      setAddFoodOpen(meal.id);
      setExpandedMeals(prev => new Set([...prev, meal.id]));
    },
  });

  const deleteMeal = useMutation({
    mutationFn: (id: number) => api.delete(`/meals/${id}`),
    onSuccess: () => { invalidate(); invalidateDash(); },
  });

  const deleteItem = useMutation({
    mutationFn: (id: number) => api.delete(`/meals/items/${id}`),
    onSuccess: () => { invalidate(); invalidateDash(); },
  });

  const totalCalories = meals.reduce((s, m) => s + m.totals.calories, 0);

  const toggleMeal = (id: number) => setExpandedMeals(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Food Log</h1>
          <p className="text-sm text-gray-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">{Math.round(totalCalories)}</p>
          <p className="text-xs text-gray-500">kcal today</p>
        </div>
      </div>

      {meals.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-sm">No meals logged yet.</p>
          <p className="text-xs mt-1">Tap + to add your first meal.</p>
        </div>
      )}

      {meals.map(meal => (
        <MealCard
          key={meal.id}
          meal={meal}
          expanded={expandedMeals.has(meal.id)}
          onToggle={() => toggleMeal(meal.id)}
          onAddFood={() => setAddFoodOpen(meal.id)}
          onDelete={() => { if (confirm('Delete this meal?')) deleteMeal.mutate(meal.id); }}
          onDeleteItem={(itemId) => deleteItem.mutate(itemId)}
        />
      ))}

      <Button onClick={() => setAddMealOpen(true)} className="w-full" variant="secondary">
        <Plus size={16} /> Add Meal
      </Button>

      {/* Add meal modal */}
      <AddMealModal
        open={addMealOpen}
        onClose={() => setAddMealOpen(false)}
        onCreate={(type) => createMeal.mutate({ meal_type: type, user_id: userId })}
        loading={createMeal.isPending}
      />

      {/* Add food to meal modal */}
      {addFoodOpen !== null && (
        <AddFoodModal
          open
          mealId={addFoodOpen}
          onClose={() => setAddFoodOpen(null)}
          onAdded={() => { invalidate(); invalidateDash(); }}
        />
      )}
    </div>
  );
}

function MealCard({ meal, expanded, onToggle, onAddFood, onDelete, onDeleteItem }: {
  meal: Meal;
  expanded: boolean;
  onToggle: () => void;
  onAddFood: () => void;
  onDelete: () => void;
  onDeleteItem: (id: number) => void;
}) {
  const mealLabel = MEAL_TYPES.find(t => t.value === meal.meal_type)?.label ?? meal.meal_type;
  const time = new Date(meal.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{mealLabel}</span>
              <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11} />{time}</span>
            </div>
            <MacroPills macros={meal.totals} compact />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{Math.round(meal.totals.calories)} kcal</span>
          {expanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800">
          {meal.items.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-600 italic">No items yet.</p>
          )}
          {meal.items.map(item => (
            <div key={item.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/50 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{item.food_name}</p>
                <p className="text-xs text-gray-500">{item.quantity} {item.serving_unit} · {Math.round(item.calories)} kcal</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <div className="text-right text-xs text-gray-500">
                  <span className="text-blue-400">{Math.round(item.protein_g)}g</span>
                  {' · '}
                  <span className="text-yellow-400">{Math.round(item.carbs_g)}g</span>
                  {' · '}
                  <span className="text-orange-400">{Math.round(item.fat_g)}g</span>
                </div>
                <button onClick={() => onDeleteItem(item.id)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <MacroBar macros={meal.totals} />
          <div className="px-4 py-3 border-t border-gray-800/50">
            <p className="text-xs font-medium text-gray-500 mb-2">Photos</p>
            <ImageGallery entityType="meal" entityId={meal.id} compact />
          </div>
          <div className="flex gap-2 p-3 border-t border-gray-800/50">
            <Button size="sm" variant="secondary" onClick={onAddFood} className="flex-1">
              <Plus size={13} /> Add Food
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-500 hover:text-red-400">
              <Trash2 size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddMealModal({ open, onClose, onCreate, loading }: {
  open: boolean; onClose: () => void;
  onCreate: (type: MealType) => void; loading: boolean;
}) {
  const [type, setType] = useState<MealType>('snack');
  return (
    <Modal open={open} onClose={onClose} title="Add Meal" size="sm">
      <div className="space-y-4">
        <Select
          label="Meal type"
          value={type}
          onChange={e => setType(e.target.value as MealType)}
          options={MEAL_TYPES}
        />
        <Button onClick={() => onCreate(type)} disabled={loading} className="w-full">
          {loading ? 'Adding…' : 'Add Meal'}
        </Button>
      </div>
    </Modal>
  );
}

function AddFoodModal({ open, mealId, onClose, onAdded }: {
  open: boolean; mealId: number; onClose: () => void; onAdded: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState('');
  const [showCreateFood, setShowCreateFood] = useState(false);

  const { data: foods = [] } = useQuery({
    queryKey: ['foods', search],
    queryFn: () => api.get<Food[]>(`/foods?search=${encodeURIComponent(search)}&limit=20`),
    enabled: search.length >= 1,
  });

  const addItem = useMutation({
    mutationFn: () => api.post(`/meals/${mealId}/items`, { food_id: selected!.id, quantity: parseFloat(quantity) }),
    onSuccess: () => {
      onAdded();
      setSelected(null);
      setQuantity('');
      setSearch('');
    },
  });

  const createFood = useMutation({
    mutationFn: (data: Partial<Food>) => api.post<Food>('/foods', data),
    onSuccess: (food) => {
      qc.invalidateQueries({ queryKey: ['foods'] });
      setSelected(food);
      setShowCreateFood(false);
    },
  });

  const scale = selected && quantity ? parseFloat(quantity) / selected.serving_size : 0;
  const preview = selected && scale > 0 ? {
    calories:  Math.round(selected.calories  * scale),
    protein_g: Math.round(selected.protein_g * scale),
    carbs_g:   Math.round(selected.carbs_g   * scale),
    fat_g:     Math.round(selected.fat_g     * scale),
  } : null;

  if (showCreateFood) {
    return (
      <Modal open={open} onClose={onClose} title="New Food" size="md">
        <QuickFoodForm
          onSave={(data) => createFood.mutate(data)}
          onCancel={() => setShowCreateFood(false)}
          loading={createFood.isPending}
        />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Food to Meal" size="md">
      <div className="space-y-4">
        <Input
          label="Search food"
          placeholder="e.g. chicken breast, oats…"
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); }}
          autoFocus
        />

        {search && foods.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-2">No results for "{search}"</p>
            <Button size="sm" variant="secondary" onClick={() => setShowCreateFood(true)}>
              <Plus size={13} /> Create "{search}"
            </Button>
          </div>
        )}

        {foods.length > 0 && !selected && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {foods.map(food => (
              <button
                key={food.id}
                onClick={() => { setSelected(food); setQuantity(String(food.serving_size)); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-800 text-left transition-colors"
              >
                <div>
                  <p className="text-sm text-white">{food.name}</p>
                  <p className="text-xs text-gray-500">{food.brand ? `${food.brand} · ` : ''}per {food.serving_size} {food.serving_unit}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{food.calories} kcal</span>
              </button>
            ))}
            <button
              onClick={() => setShowCreateFood(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 text-sm transition-colors"
            >
              <Plus size={13} /> Add new food…
            </button>
          </div>
        )}

        {selected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{selected.name}</p>
                <p className="text-xs text-gray-500">per {selected.serving_size} {selected.serving_unit}: {selected.calories} kcal</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-white">change</button>
            </div>
            <Input
              label={`Quantity (${selected.serving_unit})`}
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              suffix={selected.serving_unit}
              autoFocus
            />
            {preview && (
              <div className="bg-gray-800 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-2">Macros for {quantity} {selected.serving_unit}</p>
                <div className="flex gap-4 text-sm">
                  <span className="text-white font-semibold">{preview.calories} kcal</span>
                  <span className="text-blue-400">{preview.protein_g}g P</span>
                  <span className="text-yellow-400">{preview.carbs_g}g C</span>
                  <span className="text-orange-400">{preview.fat_g}g F</span>
                </div>
              </div>
            )}
            <Button
              onClick={() => addItem.mutate()}
              disabled={!quantity || parseFloat(quantity) <= 0 || addItem.isPending}
              className="w-full"
            >
              {addItem.isPending ? 'Adding…' : 'Add to Meal'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function QuickFoodForm({ onSave, onCancel, loading }: {
  onSave: (data: Partial<Food>) => void; onCancel: () => void; loading: boolean;
}) {
  const [form, setForm] = useState<Partial<Food>>({
    name: '', serving_size: 100, serving_unit: 'g',
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0,
  });
  const set = (k: keyof Food) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }));

  return (
    <div className="space-y-3">
      <Input label="Food name *" value={form.name} onChange={set('name')} placeholder="e.g. Greek Yogurt" />
      <Input label="Brand (optional)" value={form.brand ?? ''} onChange={set('brand')} placeholder="e.g. Chobani" />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Serving size" type="number" value={form.serving_size} onChange={set('serving_size')} />
        <Input label="Unit" value={form.serving_unit} onChange={set('serving_unit')} placeholder="g / oz / serving" />
      </div>
      <p className="text-xs text-gray-500 -mt-1">Macros per serving above:</p>
      <div className="grid grid-cols-3 gap-2">
        <Input label="Calories" type="number" value={form.calories} onChange={set('calories')} />
        <Input label="Protein (g)" type="number" value={form.protein_g} onChange={set('protein_g')} />
        <Input label="Carbs (g)" type="number" value={form.carbs_g} onChange={set('carbs_g')} />
        <Input label="Fat (g)" type="number" value={form.fat_g} onChange={set('fat_g')} />
        <Input label="Fiber (g)" type="number" value={form.fiber_g} onChange={set('fiber_g')} />
        <Input label="Sugar (g)" type="number" value={form.sugar_g} onChange={set('sugar_g')} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.name || loading} className="flex-1">
          {loading ? 'Saving…' : 'Save Food'}
        </Button>
      </div>
    </div>
  );
}
