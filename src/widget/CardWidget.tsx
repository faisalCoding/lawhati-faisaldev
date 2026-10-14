import { FlexWidget, ListWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

import { iconSvg } from './icons';
import { WIDGET_ACTIONS, widgetLinks, type CardWidgetModel } from './model';
import { BoardBar, DARK, DueBadge, LIGHT, Message, TaskRow, type Palette } from './parts';

type OkModel = Extract<CardWidgetModel, { status: 'ok' }>;

/** Up / down buttons that move the card one place within its list, without opening the app. */
function MoveControls({ model, palette }: { model: OkModel; palette: Palette }) {
  const data = { boardId: model.boardId, cardId: model.cardId };
  const button = (icon: string, action: string, enabled: boolean, label: string) => (
    <FlexWidget
      // A button that cannot move the card does nothing (instead of opening the card).
      clickAction={enabled ? action : WIDGET_ACTIONS.none}
      clickActionData={enabled ? data : undefined}
      accessibilityLabel={label}
      style={{
        width: 30,
        height: 28,
        borderRadius: 9,
        backgroundColor: palette.raised,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SvgWidget svg={iconSvg(icon, enabled ? palette.title : palette.faint, 2.4)} style={{ width: 16, height: 16 }} />
    </FlexWidget>
  );
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 4 }}>
      {button('arrow-down', WIDGET_ACTIONS.down, model.index < model.count - 1, 'خفض البطاقة')}
      <TextWidget text={`${model.index + 1}/${model.count}`} style={{ fontSize: 11, color: palette.subtle }} />
      {button('arrow-up', WIDGET_ACTIONS.up, model.index > 0, 'رفع البطاقة')}
    </FlexWidget>
  );
}

function CardView({
  model,
  palette,
  dark,
  compact,
  widgetId,
}: {
  model: CardWidgetModel;
  palette: Palette;
  dark: boolean;
  compact: boolean;
  widgetId: number;
}) {
  if (model.status !== 'ok') {
    const missing = model.status === 'missing';
    return (
      <Message
        palette={palette}
        title={missing ? 'لم تعد هذه البطاقة موجودة' : 'لم تُختر بطاقة بعد'}
        hint={`اضغط مطولًا على الودجت ثم «إعادة الضبط» لاختيار بطاقة${missing ? ' أخرى' : ''}`}
      />
    );
  }

  const doneCount = model.tasks.filter((t) => t.done).length;

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: model.uri }}
      accessibilityLabel={`${model.cardTitle}، في قائمة ${model.listTitle}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: palette.surface,
        borderRadius: 24,
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <BoardBar
        color={model.boardColor}
        icon={model.boardIcon}
        title={model.boardTitle}
        caption={model.listTitle}
        changeUri={widgetLinks.changeCard(widgetId)}
        changeLabel="تغيير البطاقة"
      />

      {/* Card title, with the buttons that move the card in its list. */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          flexGap: 8,
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 2,
        }}
      >
        <MoveControls model={model} palette={palette} />
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={model.cardTitle}
            maxLines={2}
            truncate="END"
            style={{
              width: 'match_parent',
              fontSize: 16,
              fontWeight: 'bold',
              color: palette.title,
              textAlign: 'right',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {!compact ? (
        <FlexWidget
          style={{
            width: 'match_parent',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexGap: 6,
            paddingHorizontal: 12,
            paddingBottom: 4,
          }}
        >
          {model.due ? <DueBadge due={model.due} palette={palette} dark={dark} /> : null}
          <TextWidget
            text={model.tasks.length ? `${doneCount}/${model.tasks.length} مهام منجزة` : 'لا توجد مهام'}
            style={{ fontSize: 12, color: palette.subtle }}
          />
        </FlexWidget>
      ) : null}

      {/* The card's tasks, scrollable; tapping one marks it done or not done. */}
      {!compact ? (
        <FlexWidget style={{ flex: 1, width: 'match_parent' }}>
          {model.tasks.length > 0 ? (
            <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
              {model.tasks.map((task) => (
                <TaskRow key={task.id} boardId={model.boardId} cardId={model.cardId} task={task} palette={palette} />
              ))}
            </ListWidget>
          ) : (
            <FlexWidget
              style={{ height: 'match_parent', width: 'match_parent', alignItems: 'center', justifyContent: 'center' }}
            >
              <TextWidget text="أضف أول مهمة لهذه البطاقة" style={{ fontSize: 13, color: palette.subtle }} />
            </FlexWidget>
          )}
        </FlexWidget>
      ) : null}

      {/* Widgets cannot hold a text field, so this opens a small input screen in the app. */}
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: widgetLinks.addTask(model.boardId, model.cardId) }}
        accessibilityLabel="إضافة مهمة"
        style={{
          width: 'match_parent',
          // Padding instead of a fixed height, so larger system font sizes don't cut the label.
          paddingVertical: 9,
          marginHorizontal: 10,
          marginTop: compact ? 6 : 4,
          marginBottom: 10,
          borderRadius: 12,
          backgroundColor: palette.raised,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          flexGap: 6,
        }}
      >
        <TextWidget text="إضافة مهمة" style={{ fontSize: 14, fontWeight: 'bold', color: palette.title }} />
        <SvgWidget svg={iconSvg('plus', palette.title, 2.4)} style={{ width: 16, height: 16 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** Light and dark versions; the launcher picks one to match the system theme. */
export function renderCardWidget(model: CardWidgetModel, heightDp: number, widgetId: number) {
  const compact = heightDp > 0 && heightDp < 170;
  return {
    light: <CardView model={model} palette={LIGHT} dark={false} compact={compact} widgetId={widgetId} />,
    dark: <CardView model={model} palette={DARK} dark compact={compact} widgetId={widgetId} />,
  };
}
