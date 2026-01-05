import {
  IconCode,
  IconFileText,
  IconFilter,
  IconPalette,
  IconPlug,
  IconRocket
} from '@tabler/icons-react'
import { Card } from '@/components/ui/card'
import { Section } from './section'

export const Features = () => (
  <Section className="grid gap-16">
    <div className="grid gap-4 text-center">
      <h2 className="font-medium font-serif text-4xl md:text-5xl">
        What We Built
      </h2>
      <p className="text-muted-foreground">
        Features that make Logixlysia special
      </p>
    </div>

    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {[
        {
          title: 'File Logging',
          description: 'Efficient file-based logging with automatic rotation',
          icon: IconFileText
        },
        {
          title: 'Custom Transports',
          description:
            'Extensible transport system for any logging destination',
          icon: IconPlug
        },
        {
          title: 'Smart Filtering',
          description:
            'Powerful filtering capabilities for precise log control',
          icon: IconFilter
        },
        {
          title: 'Beautiful Formatting',
          description: 'Human-readable and machine-parseable output formats',
          icon: IconPalette
        },
        {
          title: 'Type Safety',
          description: 'Full TypeScript support with excellent DX',
          icon: IconCode
        },
        {
          title: 'Performance',
          description: 'Lightweight and fast, built for production',
          icon: IconRocket
        }
      ].map(feature => {
        const Icon = feature.icon
        return (
          <Card
            className="group bg-card/50 p-6 transition-all duration-300 hover:border-primary/50 hover:shadow-lg"
            key={feature.title}
          >
            <div className="grid gap-8">
              <div className="text-primary">
                <Icon className="size-6" />
              </div>
              <div className="grid gap-2">
                <h3 className="font-medium font-serif text-xl">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  </Section>
)
